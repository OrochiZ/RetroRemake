"use strict";

let datFiles = new Array(9);
let pacImageBytes = {}; 
let resourceIndexTable = [];
let skleData =[];     
let hitData = [];      
let motionData = [];  
let mapData =[];      
let imageCache = {}; 
let mainPlayer = 0; 

class SafeReader {
    constructor(buffer) { this.dv = new DataView(buffer); this.ptr = 0; }
    getU8() { if (this.ptr >= this.dv.byteLength) return 0; return this.dv.getUint8(this.ptr++); }
    getU16() { if (this.ptr + 2 > this.dv.byteLength) return 0; let v = this.dv.getUint16(this.ptr, false); this.ptr += 2; return v; }
    getI16() { if (this.ptr + 2 > this.dv.byteLength) return 0; let v = this.dv.getInt16(this.ptr, false); this.ptr += 2; return v; }
    getU32() { if (this.ptr + 4 > this.dv.byteLength) return 0; let v = this.dv.getUint32(this.ptr, false); this.ptr += 4; return v; }
}

async function fetchSafe(url) {
    try { let res = await fetch(url); if (res.ok) return res; } catch(e) {}
    return null;
}

function parsePacFile(buffer, idArray) {
    let reader = new SafeReader(buffer);
    for (let i = 0; i < idArray.length; i++) {
        let len = reader.getU16();
        if (len <= 0) continue;
        let actualLen = Math.min(len, buffer.byteLength - reader.ptr);
        pacImageBytes[idArray[i]] = new Uint8Array(buffer, reader.ptr, actualLen);
        reader.ptr += actualLen;
    }
}

function readSkleDataStrict(reader) {
    let frameCount = reader.getU16();
    let frames =[];
    for(let f = 0; f < frameCount; f++) {
        let shortCount = reader.getU16();
        let parts =[];
        let numParts = Math.floor(shortCount / 3);
        for(let p = 0; p < numParts; p++) { 
            parts.push({ imgId: reader.getU16(), ox: reader.getI16(), oy: reader.getI16() });
        }
        for (let i = 0; i < (shortCount % 3); i++) reader.getU16();
        frames.push(parts);
    }
    return frames;
}

function read2DArray(reader) {
    let len = reader.getU16(); let arr =[];
    for(let i=0; i<len; i++) {
        let subLen = reader.getU16(); let subArr =[];
        for(let j=0; j<subLen; j++) subArr.push(reader.getI16());
        arr.push(subArr);
    }
    return arr;
}
function skip2DArray(reader) {
    let len = reader.getU16();
    for(let i = 0; i < len; i++) { let subLen = reader.getU16(); reader.ptr += subLen * 2; }
}
function skip1DArray(reader) { let len = reader.getU16(); reader.ptr += len * 2; }

function getGlobalImageId(localId) {
    if (localId >= 449) return 390 + (localId - 202); 
    if (localId >= 202) return 390 + (localId - 202); 
    if (localId >= 145) return 291 + (localId - 145);
    if (localId >= 75) return 220 + (localId - 74);
    if (localId === 128) return 274;
    if (localId >= 64) return 210 + (localId - 64);
    return PLAYER_SPRITE_START_INDEX[mainPlayer] + localId;
}

function getImageBytes(index) {
    if (pacImageBytes[index]) return pacImageBytes[index];
    if (index < 0 || index >= resourceIndexTable.length - 1) return null;
    let start = resourceIndexTable[index], end = resourceIndexTable[index + 1];
    let length = end - start;
    if (length <= 0) return null;

    let fStart = Math.floor(start / CHUNK_SIZE), fEnd = Math.floor(end / CHUNK_SIZE);
    let oStart = start % CHUNK_SIZE;
    let result = new Uint8Array(length);

    if (fStart === fEnd) {
        if (!datFiles[fStart]) return null;
        result.set(datFiles[fStart].subarray(oStart, oStart + length), 0);
    } else {
        let p1Len = CHUNK_SIZE - oStart;
        if (datFiles[fStart]) result.set(datFiles[fStart].subarray(oStart, CHUNK_SIZE), 0);
        if (datFiles[fEnd]) result.set(datFiles[fEnd].subarray(0, length - p1Len), p1Len);
    }
    return result;
}

async function ensureImageLoaded(imgId) {
    if (imageCache[imgId] !== undefined) return imageCache[imgId];
    let bytes = getImageBytes(imgId);
    if (!bytes || bytes.length === 0 || bytes[0] !== 0x89 || bytes[1] !== 0x50) { imageCache[imgId] = null; return null; }
    return new Promise((resolve) => {
        let blob = new Blob([bytes], { type: 'image/png' });
        let url = URL.createObjectURL(blob);
        let img = new Image();
        img.onload = () => { imageCache[imgId] = img; URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { imageCache[imgId] = null; URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}

async function loadCommonResources(onProgress, onSuccess, onError) {
    try {
        if (onProgress) onProgress("正在下载基础数据文件...");
        for (let i = 0; i <= 8; i++) {
            const res = await fetchSafe(`res/${i}.dat`);
            if (res) datFiles[i] = new Uint8Array(await res.arrayBuffer());
        }
        
        let r = new SafeReader(datFiles[0].buffer);
        let aint0 = r.getU16(); r.getU16(); r.ptr += 6;
        let aint2 = r.getU16(); let aint3 = r.getU16(); r.ptr += 16;
        resourceIndexTable = new Uint32Array(aint2 + aint3 + 1);
        for (let i = 0; i < aint2 + aint3 + 1; i++) resourceIndexTable[i] = r.getU32() + aint0;

        if (onProgress) onProgress("正在解析图像包...");
        for (let i = 0; i <= 5; i++) {
            let re = await fetchSafe(`res/e${i}png.pac`); if (re) parsePacFile(await re.arrayBuffer(), ENEMY_DATA_GROUP[i]);
            if (i !== 2 && i !== 5) {
                let rb = await fetchSafe(`res/b${i}png.pac`); if (rb) parsePacFile(await rb.arrayBuffer(), BOSS_DATA_GROUP[i]);
            }
        }

        if (onProgress) onProgress("正在构建动作与判定数据...");
        let rs = await fetchSafe(`res/p_skle.bin`); if (rs) { let rd = new SafeReader(await rs.arrayBuffer()); for(let i=0;i<5;i++) skleData[i] = readSkleDataStrict(rd); }
        let rh = await fetchSafe(`res/p_hit.bin`); if (rh) { let rd = new SafeReader(await rh.arrayBuffer()); for(let i=0;i<5;i++) hitData[i] = read2DArray(rd); }
        let rm = await fetchSafe(`res/p_motion.bin`); if (rm) { 
            let rd = new SafeReader(await rm.arrayBuffer()); 
            for(let c=0;c<5;c++) {
                let sc = rd.getU16(); motionData[c] =[];
                for(let s=0;s<sc;s++) { let c2 = rd.getU16(); let seq=[]; for(let k=0;k<c2;k++) seq.push(rd.getU16()); motionData[c].push(seq); }
            }
        }

        if (datFiles[8]) {
            let rd = new SafeReader(datFiles[8].buffer);
            let ts = rd.getU16(); let it =[];
            for (let i = 0; i < ts + 1; i++) it.push(rd.getU32() + 22);
            rd.ptr = it[2];
            skleData[5] = readSkleDataStrict(rd); skleData[6] = readSkleDataStrict(rd); skleData[7] = readSkleDataStrict(rd); skleData[8] = readSkleDataStrict(rd);
            skip2DArray(rd); skip2DArray(rd); skip2DArray(rd);
            hitData[5] = read2DArray(rd); hitData[7] = read2DArray(rd); 
            skip2DArray(rd); skip2DArray(rd); skip2DArray(rd); skip1DArray(rd); skip1DArray(rd); skip1DArray(rd);
            let esc = rd.getU16(); let eseqs =[];
            for (let s = 0; s < esc; s++) { let c2 = rd.getU16(); let seq =[]; for (let k = 0; k < c2; k++) seq.push(rd.getU16()); eseqs.push(seq); }
            
            // 【史诗级修复】：强制填充93个主角动画占位符，完美对齐J2ME引擎的全局索引
            let basePlayerMotion = (motionData[mainPlayer] ||[]).slice(0, 93);
            while (basePlayerMotion.length < 93) basePlayerMotion.push([]);
            for (let c = 0; c <= 8; c++) { 
                let prefix = (motionData[c] && motionData[c].length >= 93) ? motionData[c].slice(0, 93) : basePlayerMotion;
                motionData[c] = prefix.concat(eseqs); 
            }
        }

        let rmap = await fetchSafe(`res/map_skle.bin`); if (rmap) {
            let rd = new SafeReader(await rmap.arrayBuffer());
            let mc = rd.getU16();
            for(let i=0;i<mc;i++) {
                let c = rd.getU16(); let m=[];
                for(let j=0;j<Math.floor(c/3);j++) m.push({ imgId: rd.getU16(), ox: rd.getI16(), oy: rd.getI16() });
                for(let k=0;k<(c%3);k++) rd.getU16();
                mapData.push(m);
            }
        }
        
        if (onSuccess) onSuccess();
    } catch (e) {
        if (onError) onError(e);
    }
}