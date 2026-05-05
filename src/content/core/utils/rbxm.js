// im cooked if this breaks

const RBXM_SIGNATURE = "<roblox!";
const PROP_TYPES = {
    STRING: 0x1,
    BOOL: 0x2,
    INT: 0x3,
    FLOAT: 0x4,
    DOUBLE: 0x5,
    UDIM: 0x6,
    UDIM2: 0x7,
    RAY: 0x8,
    FACES: 0x9,
    AXES: 0xA,
    BRICKCOLOR: 0xB,
    COLOR3: 0xC,
    VECTOR2: 0xD,
    VECTOR3: 0xE,
    CFRAME: 0x10,
    ENUM: 0x12,
    REF: 0x13,
    INT64: 0x15,
    SHARED_STRING: 0x16,
    COLOR3UINT8: 0x1A,
    INT64_B: 0x1B,
    INT32_C: 0x1C,
    INT64_21: 0x21
};



class ByteReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.index = 0;
    }

    jump(count) { this.index += count; }

    readUInt8() { return this.view.getUint8(this.index++); }

    readUInt32LE() {
        const val = this.view.getUint32(this.index, true);
        this.index += 4;
        return val;
    }

    readInt32LE() {
        const val = this.view.getInt32(this.index, true);
        this.index += 4;
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

    getRemaining() { return this.buffer.byteLength - this.index; }


    readInterleavedInt32Array(count) {
        if (count < 0 || count > 0x1000000) throw new RangeError(`Suspicious Int32Array count: ${count}`);
        const values = new Int32Array(count);
        if (count === 0) return values;

        const byteCount = count * 4;
        const rawBytes = new Uint8Array(this.buffer, this.index, byteCount);
        this.index += byteCount;

        for (let i = 0; i < count; i++) {
            const b1 = rawBytes[i];
            const b2 = rawBytes[i + count];
            const b3 = rawBytes[i + count * 2];
            const b4 = rawBytes[i + count * 3];
            values[i] = (b1 << 24) | (b2 << 16) | (b3 << 8) | b4;
        }

        return values;
    }

    readInterleavedFloatArray(count) {
        if (count < 0 || count > 0x1000000) throw new RangeError(`Suspicious Float32Array count: ${count}`);
        const values = new Float32Array(count);
        if (count === 0) return values;

        const byteCount = count * 4;
        const rawBytes = new Uint8Array(this.buffer, this.index, byteCount);
        this.index += byteCount;

        const floatView = new DataView(values.buffer);
        for (let i = 0; i < count; i++) {
            const b1 = rawBytes[i];
            const b2 = rawBytes[i + count];
            const b3 = rawBytes[i + count * 2];
            const b4 = rawBytes[i + count * 3];

            const v = (b1 << 24) | (b2 << 16) | (b3 << 8) | b4;
            const u = (v >>> 1) ^ (v >> 31);
            floatView.setUint32(i * 4, u, true);
        }

        return values;
    }
}


function decompressLz4(input, outputSize) {
    const output = new Uint8Array(outputSize);
    let i = 0, j = 0;
    while (i < input.length) {
        const token = input[i++];
        let literalLength = token >> 4;
        if (literalLength > 0) {
            if (literalLength === 0x0F) { let lenByte; do { lenByte = input[i++]; literalLength += lenByte; } while (lenByte === 0xFF); }
            for (let l = 0; l < literalLength; l++) { output[j++] = input[i++]; }
        }
        if (i >= input.length) break;
        const offset = input[i++] | (input[i++] << 8);
        let matchLength = (token & 0x0F) + 4;
        if (matchLength === 0x0F + 4) { let lenByte; do { lenByte = input[i++]; matchLength += lenByte; } while (lenByte === 0xFF); }
        let pos = j - offset;
        for (let m = 0; m < matchLength; m++) { output[j++] = output[pos++]; }
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
        const sharedStrings = new Map();

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
                dataBuffer = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + decompressedLength);
            } else {
                const chunkData = reader.readBytes(compressedLength);
                dataBuffer = decompressLz4(chunkData, decompressedLength);
            }

            const chunkReader = new ByteReader(dataBuffer);

            if (chunkType === 'SSTR') {
                const version = chunkReader.readUInt32LE();
                const md5Count = chunkReader.readUInt32LE();
                for (let i = 0; i < md5Count; i++) {
                    const hash = chunkReader.readBytes(16);
                    const length = chunkReader.readUInt32LE();
                    const str = chunkReader.readString(length);
                    const hashKey = Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
                    sharedStrings.set(hashKey, str);
                }
            } else if (chunkType === 'INST') {
                const classId = chunkReader.readUInt32LE();
                const classNameLen = chunkReader.readUInt32LE();
                const className = chunkReader.readString(classNameLen);
                const isService = chunkReader.readUInt8();
                const count = chunkReader.readUInt32LE();
                const ids = chunkReader.readInterleavedInt32Array(count);

                const realIds = [];
                let currentId = 0;
                for (let i = 0; i < count; i++) {
                    currentId += ids[i];
                    realIds.push(currentId);
                }

                classMetadata.set(classId, { className, instanceIds: realIds });

                realIds.forEach(id => {
                    instances.set(id, {
                        ClassName: className,
                        Reference: id.toString(),
                        Properties: {},
                        Children: []
                    });
                });

            } else if (chunkType === 'PROP') {
                const classId = chunkReader.readUInt32LE();
                const propNameLen = chunkReader.readUInt32LE();
                const propName = chunkReader.readString(propNameLen);
                const propType = chunkReader.readUInt8();

                const classData = classMetadata.get(classId);
                if (!classData) continue;

                const instanceIds = classData.instanceIds;
                const count = instanceIds.length;



                if (propType === PROP_TYPES.STRING) {
                    for (let i = 0; i < count; i++) {
                        const len = chunkReader.readUInt32LE();
                        const val = chunkReader.readString(len);
                        instances.get(instanceIds[i]).Properties[propName] = val;
                    }
                } else if (propType === PROP_TYPES.BOOL) {
                    for (let i = 0; i < count; i++) {
                        const val = chunkReader.readUInt8() === 1;
                        instances.get(instanceIds[i]).Properties[propName] = val;
                    }
                } else if (propType === PROP_TYPES.FLOAT) {
                    const values = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = values[i];
                    }
                } else if (propType === PROP_TYPES.COLOR3) {
                    const rs = chunkReader.readInterleavedFloatArray(count);
                    const gs = chunkReader.readInterleavedFloatArray(count);
                    const bs = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = { r: rs[i], g: gs[i], b: bs[i] };
                    }
                } else if (propType === PROP_TYPES.VECTOR3) {
                    const xs = chunkReader.readInterleavedFloatArray(count);
                    const ys = chunkReader.readInterleavedFloatArray(count);
                    const zs = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = { x: xs[i], y: ys[i], z: zs[i] };
                    }
                } else if (propType === PROP_TYPES.VECTOR2) {
                    const xs = chunkReader.readInterleavedFloatArray(count);
                    const ys = chunkReader.readInterleavedFloatArray(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = { x: xs[i], y: ys[i] };
                    }
                } else if (propType === PROP_TYPES.SHARED_STRING) {
                    for (let i = 0; i < count; i++) {
                        const hash = chunkReader.readBytes(16);
                        const hashKey = Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
                        instances.get(instanceIds[i]).Properties[propName] = sharedStrings.get(hashKey) || "";
                    }
                } else if (propType === PROP_TYPES.CFRAME) {
                    const rotations = [];
                    for (let inst = 0; inst < count; inst++) {
                        const rotId = chunkReader.readUInt8();
                        if (rotId === 0) {
                            const floats = [];
                            for (let f = 0; f < 9; f++) {
                                floats.push(chunkReader.view.getFloat32(chunkReader.index, true));
                                chunkReader.index += 4;
                            }
                            rotations.push(floats);
                        } else {
                            const getVec = (id) => id === 0 ? [1,0,0] : id === 1 ? [0,1,0] : id === 2 ? [0,0,1] : id === 3 ? [-1,0,0] : id === 4 ? [0,-1,0] : [0,0,-1];
                            const rId = rotId - 1;
                            const right = getVec(Math.floor(rId / 6));
                            const up = getVec(rId % 6);
                            const back = [
                                right[1]*up[2] - right[2]*up[1],
                                right[2]*up[0] - right[0]*up[2],
                                right[0]*up[1] - right[1]*up[0]
                            ];
                            rotations.push([right[0],up[0],back[0],right[1],up[1],back[1],right[2],up[2],back[2]]);
                        }
                    }

                    const xs = chunkReader.readInterleavedFloatArray(count);
                    const ys = chunkReader.readInterleavedFloatArray(count);
                    const zs = chunkReader.readInterleavedFloatArray(count);

                    for (let inst = 0; inst < count; inst++) {
                        const rot = rotations[inst];
                        instances.get(instanceIds[inst]).Properties[propName] = `${xs[inst]}, ${ys[inst]}, ${zs[inst]}, ${rot.join(', ')}`;
                    }
                } else if (propType === PROP_TYPES.INT || propType === PROP_TYPES.ENUM) {
                    const values = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = values[i];
                    }
                } else if (propType === PROP_TYPES.REF) {
                    const deltas = chunkReader.readInterleavedInt32Array(count);
                    let refId = 0;
                    for (let i = 0; i < count; i++) {
                        refId += deltas[i];
                        instances.get(instanceIds[i]).Properties[propName] = refId;
                    }
                } else if (propType === PROP_TYPES.DOUBLE) {
                    for (let i = 0; i < count; i++) {
                        const val = chunkReader.view.getFloat64(chunkReader.index, false);
                        chunkReader.index += 8;
                        instances.get(instanceIds[i]).Properties[propName] = val;
                    }
                } else if (propType === PROP_TYPES.INT64 || propType === PROP_TYPES.INT64_B || propType === PROP_TYPES.INT64_21) {
                    const byteCount = count * 8;
                    const rawBytes = new Uint8Array(chunkReader.buffer, chunkReader.index, byteCount);
                    chunkReader.index += byteCount;
                    for (let i = 0; i < count; i++) {
                        const b1 = rawBytes[i], b2 = rawBytes[i + count], b3 = rawBytes[i + count * 2], b4 = rawBytes[i + count * 3];
                        const b5 = rawBytes[i + count * 4], b6 = rawBytes[i + count * 5], b7 = rawBytes[i + count * 6], b8 = rawBytes[i + count * 7];
                        const hi = (b1 << 24) | (b2 << 16) | (b3 << 8) | b4;
                        const lo = (b5 << 24) | (b6 << 16) | (b7 << 8) | b8;
                        instances.get(instanceIds[i]).Properties[propName] = hi * 0x100000000 + (lo >>> 0);
                    }
                } else if (propType === PROP_TYPES.INT32_C) {
                    const values = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = values[i];
                    }
                } else if (propType === PROP_TYPES.UDIM) {
                    const scales = chunkReader.readInterleavedFloatArray(count);
                    const offsets = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = { Scale: scales[i], Offset: offsets[i] };
                    }
                } else if (propType === PROP_TYPES.UDIM2) {
                    const xScales = chunkReader.readInterleavedFloatArray(count);
                    const yScales = chunkReader.readInterleavedFloatArray(count);
                    const xOffsets = chunkReader.readInterleavedInt32Array(count);
                    const yOffsets = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = {
                            X: { Scale: xScales[i], Offset: xOffsets[i] },
                            Y: { Scale: yScales[i], Offset: yOffsets[i] }
                        };
                    }
                } else if (propType === PROP_TYPES.RAY) {
                    for (let i = 0; i < count; i++) {
                        const ox = chunkReader.view.getFloat32(chunkReader.index, true); chunkReader.index += 4;
                        const oy = chunkReader.view.getFloat32(chunkReader.index, true); chunkReader.index += 4;
                        const oz = chunkReader.view.getFloat32(chunkReader.index, true); chunkReader.index += 4;
                        const dx = chunkReader.view.getFloat32(chunkReader.index, true); chunkReader.index += 4;
                        const dy = chunkReader.view.getFloat32(chunkReader.index, true); chunkReader.index += 4;
                        const dz = chunkReader.view.getFloat32(chunkReader.index, true); chunkReader.index += 4;
                        instances.get(instanceIds[i]).Properties[propName] = { Origin: { x: ox, y: oy, z: oz }, Direction: { x: dx, y: dy, z: dz } };
                    }
                } else if (propType === PROP_TYPES.FACES || propType === PROP_TYPES.AXES) {
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = chunkReader.readUInt8();
                    }
                } else if (propType === PROP_TYPES.BRICKCOLOR) {
                    const values = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = values[i];
                    }
                } else if (propType === 0x19) {
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = chunkReader.readUInt8();
                    }
                } else if (propType === PROP_TYPES.COLOR3UINT8) {
                    for (let i = 0; i < count; i++) {
                        const r = chunkReader.readUInt8();
                        const g = chunkReader.readUInt8();
                        const b = chunkReader.readUInt8();
                        instances.get(instanceIds[i]).Properties[propName] = { r, g, b };
                    }
                } else {
                    chunkReader.index = chunkReader.buffer.byteLength;
                }

            } else if (chunkType === 'PRNT') {
                const version = chunkReader.readUInt8();
                const count = chunkReader.readUInt32LE();

                const childIdsDelta = chunkReader.readInterleavedInt32Array(count);
                const parentIdsDelta = chunkReader.readInterleavedInt32Array(count);

                let childId = 0;
                let parentId = 0;

                for (let i = 0; i < count; i++) {
                    childId += childIdsDelta[i];
                    parentId += parentIdsDelta[i];

                    const childObj = instances.get(childId);
                    const parentObj = instances.get(parentId);

                    if (childObj) {
                        if (parentObj) {
                            parentObj.Children.push(childObj);
                        }
                    }
                }
            }
        }



        const childrenRefs = new Set();
        instances.forEach(inst => {
            inst.Children.forEach(child => childrenRefs.add(child.Reference));
        });

        instances.forEach((inst, ref) => {
            if (!childrenRefs.has(ref.toString())) {
                roots.push(inst);
            }
        });

        return roots;

    } catch (e) {
        console.error("[Rovalra RBXM Parser] Failed:", e);
        return [];
    }
}
