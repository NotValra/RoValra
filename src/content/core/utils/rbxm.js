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
    ENUM: 0x13,
    REF: 0x14,
    INT64: 0x15,
    SHARED_STRING: 0x16,
    OPTIONAL: 0x1A
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
            values[i] = (b1) | (b2 << 8) | (b3 << 16) | (b4 << 24);
        }
        

        return values;
    }

    readInterleavedFloatArray(count) {
        const intValues = this.readInterleavedInt32Array(count);
        const floatValues = new Float32Array(intValues.buffer);
        return floatValues;
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

        const roots = []; 

        while (reader.getRemaining() > 4) {
            const chunkType = reader.readString(4);
            if (chunkType === 'END\0') break;

            const compressedLength = reader.readUInt32LE();
            const decompressedLength = reader.readUInt32LE();
            reader.jump(4); 

            const chunkData = reader.readBytes(compressedLength);
            
          
            let dataBuffer;
            if (compressedLength === 0) {
                dataBuffer = chunkData.buffer.slice(chunkData.byteOffset, chunkData.byteOffset + decompressedLength);
            } else {
                dataBuffer = decompressLz4(chunkData, decompressedLength);
            }

            const chunkReader = new ByteReader(dataBuffer);


            if (chunkType === 'INST') {
                const classId = chunkReader.readUInt32LE();
                const classNameLen = chunkReader.readUInt32LE();
                const className = chunkReader.readString(classNameLen);
                const isService = chunkReader.readUInt8(); 
                const count = chunkReader.readUInt32LE();
                const ids = chunkReader.readInterleavedInt32Array(count);

                const realIds = [];
                let currentId = 0;
                for(let i=0; i<count; i++) {
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
                } else if (propType === PROP_TYPES.DOUBLE) {

                    for (let i = 0; i < count; i++) {

                        try {

                        } catch(e) {}
                    }
                } else if (propType === PROP_TYPES.INT || propType === PROP_TYPES.ENUM) {
                    const values = chunkReader.readInterleavedInt32Array(count);
                    for (let i = 0; i < count; i++) {
                        instances.get(instanceIds[i]).Properties[propName] = values[i];
                    }
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
                        } else {

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