// Binary RBXM/RBXL parser. Layout follows the official spec:
// https://dom.rojo.space/binary

import { decompress as zstdDecompress } from 'fzstd';

const RBXM_SIGNATURE = '<roblox!';

// Property data type IDs, per the spec table.
const PROP_TYPES = {
    STRING: 0x01,
    BOOL: 0x02,
    INT: 0x03,
    FLOAT: 0x04,
    DOUBLE: 0x05,
    UDIM: 0x06,
    UDIM2: 0x07,
    RAY: 0x08,
    FACES: 0x09,
    AXES: 0x0a,
    BRICKCOLOR: 0x0b,
    COLOR3: 0x0c,
    VECTOR2: 0x0d,
    VECTOR3: 0x0e,
    VECTOR3INT16: 0x14,
    CFRAME: 0x10,
    QUATERNION: 0x11,
    ENUM: 0x12,
    REF: 0x13,
    NUMBER_SEQUENCE: 0x15,
    COLOR_SEQUENCE: 0x16,
    NUMBER_RANGE: 0x17,
    RECT: 0x18,
    PHYSICAL_PROPERTIES: 0x19,
    COLOR3UINT8: 0x1a,
    INT64: 0x1b,
    SHARED_STRING: 0x1c,
    BYTECODE: 0x1d,
    OPTIONAL_CFRAME: 0x1e,
    UNIQUE_ID: 0x1f,
    FONT: 0x20,
    SECURITY_CAPABILITIES: 0x21,
    CONTENT: 0x22,
};

// Roblox stores f32 with the sign bit rotated to the least-significant bit.
function untransformFloat(v) {
    const u = ((v << 31) | (v >>> 1)) >>> 0;
    untransformFloat._view.setUint32(0, u, true);
    return untransformFloat._view.getFloat32(0, true);
}
untransformFloat._view = new DataView(new ArrayBuffer(4));

class ByteReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.index = 0;
    }

    jump(count) {
        this.index += count;
    }

    readUInt8() {
        return this.view.getUint8(this.index++);
    }

    readUInt16LE() {
        const val = this.view.getUint16(this.index, true);
        this.index += 2;
        return val;
    }

    readInt16LE() {
        const val = this.view.getInt16(this.index, true);
        this.index += 2;
        return val;
    }

    readUInt32LE() {
        const val = this.view.getUint32(this.index, true);
        this.index += 4;
        return val;
    }

    readFloat32LE() {
        const val = this.view.getFloat32(this.index, true);
        this.index += 4;
        return val;
    }

    readFloat64LE() {
        const val = this.view.getFloat64(this.index, true);
        this.index += 8;
        return val;
    }

    readString(len) {
        const bytes = new Uint8Array(this.buffer, this.index, len);
        this.index += len;
        return new TextDecoder().decode(bytes);
    }

    readBytes(len) {
        const bytes = new Uint8Array(this.buffer, this.index, len);
        this.index += len;
        return bytes;
    }

    getRemaining() {
        return this.buffer.byteLength - this.index;
    }

    // Reads `count` big-endian, byte-interleaved u32 values.
    readInterleavedUInt32Array(count) {
        if (count < 0 || count > 0x1000000)
            throw new RangeError(`Suspicious UInt32 count: ${count}`);
        const values = new Array(count);
        if (count === 0) return values;

        const byteCount = count * 4;
        const raw = new Uint8Array(this.buffer, this.index, byteCount);
        this.index += byteCount;

        for (let i = 0; i < count; i++) {
            values[i] =
                ((raw[i] << 24) |
                    (raw[i + count] << 16) |
                    (raw[i + count * 2] << 8) |
                    raw[i + count * 3]) >>>
                0;
        }
        return values;
    }

    // Same as above but applies the spec's zigzag transform to get signed ints.
    readInterleavedInt32Array(count) {
        const values = this.readInterleavedUInt32Array(count);
        for (let i = 0; i < count; i++) {
            const u = values[i];
            values[i] = (u >>> 1) ^ -(u & 1);
        }
        return values;
    }

    readInterleavedFloatArray(count) {
        const values = this.readInterleavedUInt32Array(count);
        for (let i = 0; i < count; i++) {
            values[i] = untransformFloat(values[i]);
        }
        return values;
    }

    // Reads `count` big-endian, byte-interleaved, zigzag-transformed i64 values.
    readInterleavedInt64Array(count) {
        if (count < 0 || count > 0x1000000)
            throw new RangeError(`Suspicious Int64 count: ${count}`);
        const values = new Array(count);
        if (count === 0) return values;

        const byteCount = count * 8;
        const raw = new Uint8Array(this.buffer, this.index, byteCount);
        this.index += byteCount;

        for (let i = 0; i < count; i++) {
            let u = 0n;
            for (let b = 0; b < 8; b++) {
                u = (u << 8n) | BigInt(raw[i + count * b]);
            }
            values[i] = (u >> 1n) ^ -(u & 1n);
        }
        return values;
    }
}

function decompressLz4(input, outputSize) {
    const output = new Uint8Array(outputSize);
    let i = 0,
        j = 0;
    while (i < input.length) {
        const token = input[i++];
        let literalLength = token >> 4;
        if (literalLength > 0) {
            if (literalLength === 0x0f) {
                let lenByte;
                do {
                    lenByte = input[i++];
                    literalLength += lenByte;
                } while (lenByte === 0xff);
            }
            for (let l = 0; l < literalLength; l++) {
                output[j++] = input[i++];
            }
        }
        if (i >= input.length) break;
        const offset = input[i++] | (input[i++] << 8);
        let matchLength = (token & 0x0f) + 4;
        if (matchLength === 0x0f + 4) {
            let lenByte;
            do {
                lenByte = input[i++];
                matchLength += lenByte;
            } while (lenByte === 0xff);
        }
        let pos = j - offset;
        for (let m = 0; m < matchLength; m++) {
            output[j++] = output[pos++];
        }
    }
    return output.buffer;
}

export function parseRbxm(buffer) {
    try {
        const reader = new ByteReader(buffer);
        const signature = reader.readString(8);
        if (signature !== RBXM_SIGNATURE) return [];

        reader.jump(8);
        reader.readUInt32LE();
        reader.readUInt32LE();
        reader.jump(8);

        const instances = new Map();
        const classMetadata = new Map();
        const sharedStrings = [];

        const roots = [];

        while (reader.getRemaining() > 4) {
            const chunkType = reader.readString(4);
            if (chunkType === 'END\0') break;

            const compressedLength = reader.readUInt32LE();
            const decompressedLength = reader.readUInt32LE();
            reader.jump(4);

            let dataBuffer;
            if (compressedLength === 0) {
                const rawBytes = reader.readBytes(decompressedLength);
                dataBuffer = rawBytes.buffer.slice(
                    rawBytes.byteOffset,
                    rawBytes.byteOffset + decompressedLength,
                );
            } else {
                const chunkData = reader.readBytes(compressedLength);
                // Zstd magic (little-endian 0xFD2FB528). Modern Roblox files use
                // Zstd; older ones use LZ4.
                const isZstd =
                    chunkData[0] === 0x28 &&
                    chunkData[1] === 0xb5 &&
                    chunkData[2] === 0x2f &&
                    chunkData[3] === 0xfd;
                if (isZstd) {
                    const out = new Uint8Array(decompressedLength);
                    zstdDecompress(chunkData, out);
                    dataBuffer = out.buffer;
                } else {
                    dataBuffer = decompressLz4(chunkData, decompressedLength);
                }
            }

            const chunkReader = new ByteReader(dataBuffer);

            // Each chunk is self-contained; the main reader already advanced past
            // its data. Isolate failures so one unknown/newer property type can't
            // abort parsing of the whole file.
            try {
            if (chunkType === 'SSTR') {
                chunkReader.readUInt32LE(); // version
                const count = chunkReader.readUInt32LE();
                for (let i = 0; i < count; i++) {
                    chunkReader.readBytes(16); // md5 hash (unused, index-addressed)
                    const length = chunkReader.readUInt32LE();
                    sharedStrings[i] = chunkReader.readString(length);
                }
            } else if (chunkType === 'INST') {
                const classId = chunkReader.readUInt32LE();
                const classNameLen = chunkReader.readUInt32LE();
                const className = chunkReader.readString(classNameLen);
                chunkReader.readUInt8(); // isService
                const count = chunkReader.readUInt32LE();
                const ids = chunkReader.readInterleavedInt32Array(count);

                const realIds = [];
                let currentId = 0;
                for (let i = 0; i < count; i++) {
                    currentId += ids[i];
                    realIds.push(currentId);
                }

                classMetadata.set(classId, { className, instanceIds: realIds });

                realIds.forEach((id) => {
                    instances.set(id, {
                        ClassName: className,
                        Reference: id.toString(),
                        Properties: {},
                        Children: [],
                    });
                });
            } else if (chunkType === 'PROP') {
                const classId = chunkReader.readUInt32LE();
                const propNameLen = chunkReader.readUInt32LE();
                const propName = chunkReader.readString(propNameLen);
                const propType = chunkReader.readUInt8();

                const classData = classMetadata.get(classId);
                if (!classData) continue;

                const ids = classData.instanceIds;
                const count = ids.length;
                const set = (i, value) => {
                    instances.get(ids[i]).Properties[propName] = value;
                };

                if (propType === PROP_TYPES.STRING) {
                    for (let i = 0; i < count; i++) {
                        const len = chunkReader.readUInt32LE();
                        // Attributes are a binary blob — keep raw bytes so the
                        // UI can decode them (UTF-8 would corrupt them).
                        if (propName === 'AttributesSerialize') {
                            set(i, chunkReader.readBytes(len).slice());
                        } else {
                            set(i, chunkReader.readString(len));
                        }
                    }
                } else if (propType === PROP_TYPES.BOOL) {
                    for (let i = 0; i < count; i++) {
                        set(i, chunkReader.readUInt8() === 1);
                    }
                } else if (propType === PROP_TYPES.INT) {
                    const values = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++) set(i, values[i]);
                } else if (propType === PROP_TYPES.FLOAT) {
                    const values = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++) set(i, values[i]);
                } else if (propType === PROP_TYPES.DOUBLE) {
                    for (let i = 0; i < count; i++)
                        set(i, chunkReader.readFloat64LE());
                } else if (propType === PROP_TYPES.UDIM) {
                    const scales = chunkReader.readInterleavedFloatArray(count);
                    const offsets = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++)
                        set(i, { Scale: scales[i], Offset: offsets[i] });
                } else if (propType === PROP_TYPES.UDIM2) {
                    const xs = chunkReader.readInterleavedFloatArray(count);
                    const ys = chunkReader.readInterleavedFloatArray(count);
                    const xo = chunkReader.readInterleavedInt32Array(count);
                    const yo = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++)
                        set(i, {
                            X: { Scale: xs[i], Offset: xo[i] },
                            Y: { Scale: ys[i], Offset: yo[i] },
                        });
                } else if (propType === PROP_TYPES.RAY) {
                    for (let i = 0; i < count; i++) {
                        const ox = chunkReader.readFloat32LE();
                        const oy = chunkReader.readFloat32LE();
                        const oz = chunkReader.readFloat32LE();
                        const dx = chunkReader.readFloat32LE();
                        const dy = chunkReader.readFloat32LE();
                        const dz = chunkReader.readFloat32LE();
                        set(i, {
                            Origin: { x: ox, y: oy, z: oz },
                            Direction: { x: dx, y: dy, z: dz },
                        });
                    }
                } else if (
                    propType === PROP_TYPES.FACES ||
                    propType === PROP_TYPES.AXES
                ) {
                    for (let i = 0; i < count; i++)
                        set(i, chunkReader.readUInt8());
                } else if (propType === PROP_TYPES.BRICKCOLOR) {
                    const values = chunkReader.readInterleavedUInt32Array(count);
                    for (let i = 0; i < count; i++) set(i, values[i]);
                } else if (propType === PROP_TYPES.COLOR3) {
                    const rs = chunkReader.readInterleavedFloatArray(count);
                    const gs = chunkReader.readInterleavedFloatArray(count);
                    const bs = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++)
                        set(i, { r: rs[i], g: gs[i], b: bs[i] });
                } else if (propType === PROP_TYPES.VECTOR2) {
                    const xs = chunkReader.readInterleavedFloatArray(count);
                    const ys = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++) set(i, { x: xs[i], y: ys[i] });
                } else if (propType === PROP_TYPES.VECTOR3) {
                    const xs = chunkReader.readInterleavedFloatArray(count);
                    const ys = chunkReader.readInterleavedFloatArray(count);
                    const zs = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++)
                        set(i, { x: xs[i], y: ys[i], z: zs[i] });
                } else if (propType === PROP_TYPES.VECTOR3INT16) {
                    for (let i = 0; i < count; i++)
                        set(i, {
                            x: chunkReader.readInt16LE(),
                            y: chunkReader.readInt16LE(),
                            z: chunkReader.readInt16LE(),
                        });
                } else if (propType === PROP_TYPES.CFRAME) {
                    const rotations = [];
                    for (let inst = 0; inst < count; inst++) {
                        const rotId = chunkReader.readUInt8();
                        if (rotId === 0) {
                            const floats = [];
                            for (let f = 0; f < 9; f++)
                                floats.push(chunkReader.readFloat32LE());
                            rotations.push(floats);
                        } else {
                            const getVec = (id) =>
                                id === 0
                                    ? [1, 0, 0]
                                    : id === 1
                                      ? [0, 1, 0]
                                      : id === 2
                                        ? [0, 0, 1]
                                        : id === 3
                                          ? [-1, 0, 0]
                                          : id === 4
                                            ? [0, -1, 0]
                                            : [0, 0, -1];
                            const rId = rotId - 1;
                            const right = getVec(Math.floor(rId / 6));
                            const up = getVec(rId % 6);
                            const back = [
                                right[1] * up[2] - right[2] * up[1],
                                right[2] * up[0] - right[0] * up[2],
                                right[0] * up[1] - right[1] * up[0],
                            ];
                            rotations.push([
                                right[0], up[0], back[0],
                                right[1], up[1], back[1],
                                right[2], up[2], back[2],
                            ]);
                        }
                    }
                    const xs = chunkReader.readInterleavedFloatArray(count);
                    const ys = chunkReader.readInterleavedFloatArray(count);
                    const zs = chunkReader.readInterleavedFloatArray(count);
                    const cleanNum = (n) =>
                        Math.abs(n) < 1e-5 ? 0 : Math.round(n * 1e5) / 1e5;
                    for (let inst = 0; inst < count; inst++) {
                        const rot = rotations[inst];
                        const parts = [xs[inst], ys[inst], zs[inst], ...rot].map(
                            cleanNum,
                        );
                        set(inst, parts.join(', '));
                    }
                } else if (propType === PROP_TYPES.ENUM) {
                    const values = chunkReader.readInterleavedUInt32Array(count);
                    for (let i = 0; i < count; i++) set(i, values[i]);
                } else if (propType === PROP_TYPES.REF) {
                    const deltas = chunkReader.readInterleavedInt32Array(count);
                    let refId = 0;
                    for (let i = 0; i < count; i++) {
                        refId += deltas[i];
                        set(i, refId);
                    }
                } else if (propType === PROP_TYPES.NUMBER_SEQUENCE) {
                    for (let i = 0; i < count; i++) {
                        const len = chunkReader.readUInt32LE();
                        const keypoints = [];
                        for (let k = 0; k < len; k++)
                            keypoints.push({
                                Time: chunkReader.readFloat32LE(),
                                Value: chunkReader.readFloat32LE(),
                                Envelope: chunkReader.readFloat32LE(),
                            });
                        set(i, keypoints);
                    }
                } else if (propType === PROP_TYPES.COLOR_SEQUENCE) {
                    for (let i = 0; i < count; i++) {
                        const len = chunkReader.readUInt32LE();
                        const keypoints = [];
                        for (let k = 0; k < len; k++) {
                            const kp = {
                                Time: chunkReader.readFloat32LE(),
                                Value: {
                                    r: chunkReader.readFloat32LE(),
                                    g: chunkReader.readFloat32LE(),
                                    b: chunkReader.readFloat32LE(),
                                },
                            };
                            chunkReader.readFloat32LE(); // unused envelope
                            keypoints.push(kp);
                        }
                        set(i, keypoints);
                    }
                } else if (propType === PROP_TYPES.NUMBER_RANGE) {
                    for (let i = 0; i < count; i++)
                        set(i, {
                            Min: chunkReader.readFloat32LE(),
                            Max: chunkReader.readFloat32LE(),
                        });
                } else if (propType === PROP_TYPES.RECT) {
                    const minX = chunkReader.readInterleavedFloatArray(count);
                    const minY = chunkReader.readInterleavedFloatArray(count);
                    const maxX = chunkReader.readInterleavedFloatArray(count);
                    const maxY = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++)
                        set(i, {
                            Min: { x: minX[i], y: minY[i] },
                            Max: { x: maxX[i], y: maxY[i] },
                        });
                } else if (propType === PROP_TYPES.PHYSICAL_PROPERTIES) {
                    for (let i = 0; i < count; i++) {
                        const flag = chunkReader.readUInt8();
                        if (flag & 1) {
                            const props = {
                                Density: chunkReader.readFloat32LE(),
                                Friction: chunkReader.readFloat32LE(),
                                Elasticity: chunkReader.readFloat32LE(),
                                FrictionWeight: chunkReader.readFloat32LE(),
                                ElasticityWeight: chunkReader.readFloat32LE(),
                            };
                            if (flag & 2) chunkReader.readFloat32LE(); // AcousticAbsorption
                            set(i, props);
                        } else {
                            set(i, false);
                        }
                    }
                } else if (propType === PROP_TYPES.COLOR3UINT8) {
                    const rs = [],
                        gs = [],
                        bs = [];
                    for (let i = 0; i < count; i++) rs.push(chunkReader.readUInt8());
                    for (let i = 0; i < count; i++) gs.push(chunkReader.readUInt8());
                    for (let i = 0; i < count; i++) bs.push(chunkReader.readUInt8());
                    for (let i = 0; i < count; i++)
                        set(i, { r: rs[i], g: gs[i], b: bs[i] });
                } else if (propType === PROP_TYPES.INT64) {
                    const values = chunkReader.readInterleavedInt64Array(count);
                    for (let i = 0; i < count; i++) set(i, values[i]);
                } else if (propType === PROP_TYPES.SHARED_STRING) {
                    const idx = chunkReader.readInterleavedUInt32Array(count);
                    for (let i = 0; i < count; i++)
                        set(i, sharedStrings[idx[i]] ?? '');
                } else if (propType === PROP_TYPES.UNIQUE_ID) {
                    const raw = chunkReader.readBytes(count * 16);
                    for (let i = 0; i < count; i++) {
                        let hex = '';
                        for (let b = 0; b < 16; b++)
                            hex += raw[b * count + i]
                                .toString(16)
                                .padStart(2, '0');
                        set(i, hex);
                    }
                } else if (propType === PROP_TYPES.FONT) {
                    for (let i = 0; i < count; i++) {
                        const familyLen = chunkReader.readUInt32LE();
                        const Family = chunkReader.readString(familyLen);
                        const Weight = chunkReader.readUInt16LE();
                        const Style = chunkReader.readUInt8();
                        const cacheLen = chunkReader.readUInt32LE();
                        chunkReader.readString(cacheLen); // CachedFaceId (unused)
                        set(i, { Family, Weight, Style });
                    }
                } else if (propType === PROP_TYPES.CONTENT) {
                    const sourceTypes =
                        chunkReader.readInterleavedInt32Array(count);

                    const numUris = chunkReader.readUInt32LE();
                    const uris = [];
                    for (let i = 0; i < numUris; i++) {
                        const len = chunkReader.readUInt32LE();
                        uris.push(chunkReader.readString(len));
                    }
                    const numObjects = chunkReader.readUInt32LE();
                    chunkReader.readInterleavedInt32Array(numObjects);
                    const numExternal = chunkReader.readUInt32LE();
                    chunkReader.readInterleavedInt32Array(numExternal);

                    let uriCounter = 0;
                    for (let i = 0; i < count; i++) {
                        // Source type 1 = URI; store the string so dependency
                        // scanning and display both work.
                        set(i, sourceTypes[i] === 1 ? uris[uriCounter++] : '');
                    }
                } else {
                    // Unhandled/complex type (Bytecode, Optional, Quaternion,
                    // SecurityCapabilities). Skip the rest of this chunk so we
                    // don't desync; the property is simply omitted.
                    chunkReader.index = chunkReader.buffer.byteLength;
                }
            } else if (chunkType === 'PRNT') {
                chunkReader.readUInt8(); // version
                const count = chunkReader.readUInt32LE();

                const childIdsDelta =
                    chunkReader.readInterleavedInt32Array(count);
                const parentIdsDelta =
                    chunkReader.readInterleavedInt32Array(count);

                let childId = 0;
                let parentId = 0;

                for (let i = 0; i < count; i++) {
                    childId += childIdsDelta[i];
                    parentId += parentIdsDelta[i];

                    const childObj = instances.get(childId);
                    const parentObj = instances.get(parentId);

                    if (childObj && parentObj) {
                        parentObj.Children.push(childObj);
                    }
                }
            }
            } catch (chunkErr) {
                console.warn(
                    `[Rovalra RBXM Parser] skipped ${chunkType.replace(/\0/g, '')} chunk:`,
                    chunkErr,
                );
            }
        }

        const childrenRefs = new Set();
        instances.forEach((inst) => {
            inst.Children.forEach((child) => childrenRefs.add(child.Reference));
        });

        instances.forEach((inst, ref) => {
            if (!childrenRefs.has(ref.toString())) {
                roots.push(inst);
            }
        });

        return roots;
    } catch (e) {
        console.error('[Rovalra RBXM Parser] Failed:', e);
        return [];
    }
}
