export class MeshConverter {
    static async convertToObj(arrayBuffer) {
        const decoder = new TextDecoder();
        const headerStr = decoder.decode(arrayBuffer.slice(0, 16));

        if (headerStr.startsWith("version 1")) {
            return this.parseV1(decoder.decode(arrayBuffer));
        } else if (headerStr.startsWith("version 2")) {
            return this.parseBinary(arrayBuffer, 2);
        } else if (headerStr.startsWith("version 3")) {
            return this.parseBinary(arrayBuffer, 3);
        } else {
            throw new Error("Unsupported mesh version: " + headerStr);
        }
    }

    static parseV1(text) {
        const lines = text.split(/\r?\n/);
        const header = lines[0].trim();
        const isV1_00 = header === "version 1.00";
        

        const dataBody = lines.slice(2).join(" "); 
        const numRegex = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
        const allNumbers = dataBody.match(numRegex);

        if (!allNumbers || allNumbers.length < 9) {
            throw new Error("No valid vertex data found in v1 mesh.");
        }

        let obj = `# Roblox Mesh ${header} to OBJ\n`;
        let verts = "";
        let uvs = "";
        let faces = "";

        const scale = isV1_00 ? 0.5 : 1.0;
        let vertexCount = 0;

        for (let i = 0; i + 8 < allNumbers.length; i += 9) {
            const x = parseFloat(allNumbers[i]) * scale;
            const y = parseFloat(allNumbers[i + 1]) * scale;
            const z = parseFloat(allNumbers[i + 2]) * scale;
            
            const u = parseFloat(allNumbers[i + 6]);
            const v = 1 - parseFloat(allNumbers[i + 7]);

            verts += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
            uvs += `vt ${u.toFixed(6)} ${v.toFixed(6)}\n`;
            
            vertexCount++;

            if (vertexCount % 3 === 0) {
                const i3 = vertexCount;
                const i2 = vertexCount - 1;
                const i1 = vertexCount - 2;
                faces += `f ${i1}/${i1} ${i2}/${i2} ${i3}/${i3}\n`;
            }
        }

        return obj + verts + uvs + faces;
    }

    static parseBinary(buffer, version) {
        const view = new DataView(buffer);
        let offset = 13; 

        const headerSize = view.getUint16(offset, true); offset += 2;
        const vertexSize = view.getUint8(offset); offset += 1;
        const faceSize = view.getUint8(offset); offset += 1;
        
        let numLODs = 1;
        if (version >= 3) {
            const sizeofLOD = view.getUint16(offset, true); offset += 2; 
            numLODs = view.getUint16(offset, true); offset += 2;
        }

        const numVertices = view.getUint32(offset, true); offset += 4;
        const numFaces = view.getUint32(offset, true); offset += 4;

        let vertOffset = 13 + headerSize;

        let obj = `# Roblox Mesh v${version} to OBJ\n`;
        let verts = "";
        let uvs = "";

        for (let i = 0; i < numVertices; i++) {
            const vx = view.getFloat32(vertOffset, true);
            const vy = view.getFloat32(vertOffset + 4, true);
            const vz = view.getFloat32(vertOffset + 8, true);
            
            const tu = view.getFloat32(vertOffset + 24, true);
            const tv = 1 - view.getFloat32(vertOffset + 28, true);

            verts += `v ${vx} ${vy} ${vz}\n`;
            uvs += `vt ${tu} ${tv}\n`;
            vertOffset += vertexSize;
        }

        let exportFaceCount = numFaces;
        if (version >= 3 && numLODs > 1) {
            const lodArrayOffset = buffer.byteLength - (numLODs * 4);
            exportFaceCount = view.getUint32(lodArrayOffset + 4, true);
        }

        let faceDataOffset = vertOffset; 
        let facesStr = "";
        for (let i = 0; i < exportFaceCount; i++) {
            const a = view.getUint32(faceDataOffset, true) + 1;
            const b = view.getUint32(faceDataOffset + 4, true) + 1;
            const c = view.getUint32(faceDataOffset + 8, true) + 1;
            
            facesStr += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`;
            faceDataOffset += faceSize;
        }

        return obj + verts + uvs + facesStr;
    }
}