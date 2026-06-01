// 时空矩阵底图配置
const TIMELINE_DATA_SOURCE = {
    esri: {
        validYears: {
            2000: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', desc: 'Esri 2000年历史测绘地貌' },
            2010: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Polyline/MapServer/tile/{z}/{y}/{x}', desc: 'Esri 2010年通道地貌' }, 
            2020: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Specialty/DeLorme_World_Base_Map/MapServer/tile/{z}/{y}/{x}', desc: 'Esri 2020年基础影像' },
            2026: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', desc: 'Esri 2026年最新纯净影像' }
        }
    },
    gaode: {
        validYears: {
            2005: { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=7&x={x}&y={y}&z={z}', desc: '高德 2005年历史影像' },
            2015: { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', desc: '高德 2015年中期影像' },
            2026: { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', desc: '高德 2026年最新影像' }
        }
    },
    osm: {
        validYears: {
            2026: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', desc: 'OSM 国际标准矢量' }
        }
    }
};

const MIANYANG_CENTER = [31.4674, 104.7415];
const MIANYANG_ZOOM = 12;

let currentProvider = 'esri'; 
let currentYear = 2026;       
let previousValidYear = 2026; 

let currentMode = 'off'; 
let swipePercent = 0.5;  
let activeTool = 'identify'; 

// 双栈视角记录
let viewHistoryStack = [];
let viewForwardStack = [];
let isNavigatingHistory = false; 

// 初始化双地图
const mapA = L.map('mapA', { minZoom: 2, zoomControl: true }).setView(MIANYANG_CENTER, MIANYANG_ZOOM);
const mapB = L.map('mapB', { minZoom: 2, zoomControl: false }).setView(MIANYANG_CENTER, MIANYANG_ZOOM);

let tileLayerA, tileLayerB;

const STYLE_LAYER_A = {
    point: { radius: 6, fillColor: '#ff4d4f', color: '#ffffff', weight: 1.5, fillOpacity: 0.85 },
    line: { color: '#ff4d4f', weight: 3.5, opacity: 0.85 },
    polygon: { color: '#ff4d4f', weight: 2, fillOpacity: 0.25 }
};

const STYLE_LAYER_B = {
    point: { radius: 6, fillColor: '#00ccff', color: '#ffffff', weight: 1.5, fillOpacity: 0.85 },
    line: { color: '#00ccff', weight: 3.5, opacity: 0.85 },
    polygon: { color: '#00ccff', weight: 2, fillOpacity: 0.25 }
};

let shpLayerA = L.geoJSON(null, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, STYLE_LAYER_A.point),
    style: (feature) => {
        if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') return STYLE_LAYER_A.line;
        return STYLE_LAYER_A.polygon;
    },
    onEachFeature: onEachFeatureHandler
}).addTo(mapA);

let shpLayerB = L.geoJSON(null, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, STYLE_LAYER_B.point),
    style: (feature) => {
        if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') return STYLE_LAYER_B.line;
        return STYLE_LAYER_B.polygon;
    },
    onEachFeature: onEachFeatureHandler
}).addTo(mapB);

// 时间轴精细控制驱动
function updateMapTimeline(targetYear) {
    const providerConfig = TIMELINE_DATA_SOURCE[currentProvider];
    
    if (!providerConfig.validYears[targetYear]) {
        document.getElementById('current-year-display').innerHTML = `
            <span style="color:#f5222d;">⚠️ ${targetYear}年 无数据</span> 
            <br><span style="font-size:12px;color:#888;">已为您维持在: ${previousValidYear}年视图</span>
        `;
        return; 
    }

    currentYear = targetYear;
    previousValidYear = targetYear; 

    if (tileLayerA) mapA.removeLayer(tileLayerA);
    if (tileLayerB) mapB.removeLayer(tileLayerB);

    const layerConfig = providerConfig.validYears[currentYear];
    const subdomains = currentProvider === 'gaode' ? ['1', '2', '3', '4'] : (currentProvider === 'osm' ? ['a', 'b', 'c'] : []);

    tileLayerA = L.tileLayer(layerConfig.url, { subdomains: subdomains, attribution: layerConfig.desc }).addTo(mapA);
    tileLayerB = L.tileLayer(layerConfig.url, { subdomains: subdomains, attribution: layerConfig.desc }).addTo(mapB);

    document.getElementById('current-year-display').innerHTML = `当前观测时期: <span style="color:#52c41a;">${currentYear}年 (已生效)</span>`;
}

document.getElementById('basemap-select').addEventListener('change', (e) => {
    currentProvider = e.target.value;
    document.getElementById('timeline-slider').value = 2026;
    updateMapTimeline(2026);
});

const timelineSlider = document.getElementById('timeline-slider');
timelineSlider.addEventListener('input', (e) => {
    updateMapTimeline(parseInt(e.target.value));
});

updateMapTimeline(2026);

// 卷帘切换控制逻辑
const swipeBar = document.getElementById('swipe-bar');
const swipeHandle = document.getElementById('swipe-handle');
const mapContainer = document.getElementById('map-container');
const panelLayerB = document.getElementById('panel-layerB');

document.getElementById('swipe-mode').addEventListener('change', (e) => {
    currentMode = e.target.value;
    const mapA_Dom = document.getElementById('mapA');
    const mapB_Dom = document.getElementById('mapB');

    if (currentMode === 'off') {
        swipeBar.style.display = 'none';
        mapB_Dom.style.display = 'none'; 
        mapB_Dom.style.pointerEvents = 'none';
        mapB_Dom.style.clipPath = 'none';
        
        mapA_Dom.style.zIndex = '10';     
        mapA_Dom.style.pointerEvents = 'auto';
        panelLayerB.style.display = 'none';
    } else {
        swipeBar.style.display = 'block';
        panelLayerB.style.display = 'block';
        mapB_Dom.style.display = 'block'; 
        mapB_Dom.style.pointerEvents = 'auto'; 
        mapB_Dom.style.zIndex = '20'; 
        mapA_Dom.style.zIndex = '10';
        
        if (currentMode === 'vertical') {
            swipeBar.className = 'swipe-vertical'; swipeHandle.innerHTML = '↔';
            swipeBar.style.top = '0'; swipeBar.style.height = '100%'; swipeBar.style.width = '4px';
        } else {
            swipeBar.className = 'swipe-horizontal'; swipeHandle.innerHTML = '↕';
            swipeBar.style.left = '0'; swipeBar.style.width = '100%'; swipeBar.style.height = '4px';
        }
        renderSwipe();
    }
    setTimeout(() => { mapA.invalidateSize(); mapB.invalidateSize(); }, 200);
});

function renderSwipe() {
    const width = mapContainer.offsetWidth;
    const height = mapContainer.offsetHeight;
    if (currentMode === 'vertical') {
        const x = width * swipePercent; swipeBar.style.left = `${x}px`;
        document.getElementById('mapB').style.clipPath = `inset(0px 0px 0px ${x}px)`;
    } else if (currentMode === 'horizontal') {
        const y = height * swipePercent; swipeBar.style.top = `${y}px`;
        document.getElementById('mapB').style.clipPath = `inset(${y}px 0px 0px 0px)`;
    }
}

let isDragging = false;
swipeBar.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = mapContainer.getBoundingClientRect();
    if (currentMode === 'vertical') {
        let clientX = e.clientX - rect.left; swipePercent = Math.max(0, Math.min(clientX, rect.width)) / rect.width;
    } else if (currentMode === 'horizontal') {
        let clientY = e.clientY - rect.top; swipePercent = Math.max(0, Math.min(clientY, rect.height)) / rect.height;
    }
    renderSwipe();
});

// 双栈视图导航追踪机制
function pushMapViewHistory() {
    if (isNavigatingHistory) return; 
    const currentCenter = mapA.getCenter();
    const currentZoom = mapA.getZoom();
    const currentViewState = { center: [currentCenter.lat, currentCenter.lng], zoom: currentZoom };

    if (viewHistoryStack.length > 0) {
        const lastState = viewHistoryStack[viewHistoryStack.length - 1];
        if (lastState.zoom === currentViewState.zoom && 
            Math.abs(lastState.center[0] - currentViewState.center[0]) < 0.00001 &&
            Math.abs(lastState.center[1] - currentViewState.center[1]) < 0.00001) {
            return;
        }
    }
    viewHistoryStack.push(currentViewState);
    viewForwardStack = []; 
    updateNavButtonStatus();
}

function updateNavButtonStatus() {
    document.getElementById('btn-view-prev').disabled = (viewHistoryStack.length <= 1);
    document.getElementById('btn-view-next').disabled = (viewForwardStack.length === 0);
}

mapA.on('moveend', pushMapViewHistory);

setTimeout(() => {
    const initCenter = mapA.getCenter();
    viewHistoryStack.push({ center: [initCenter.lat, initCenter.lng], zoom: mapA.getZoom() });
}, 500);

document.getElementById('btn-view-prev').addEventListener('click', () => {
    if (viewHistoryStack.length <= 1) return;
    isNavigatingHistory = true;
    const currentState = viewHistoryStack.pop(); 
    viewForwardStack.push(currentState);         
    const prevState = viewHistoryStack[viewHistoryStack.length - 1]; 
    mapA.setView(prevState.center, prevState.zoom, { animate: true, duration: 0.4 });
    setTimeout(() => { isNavigatingHistory = false; updateNavButtonStatus(); }, 450);
});

document.getElementById('btn-view-next').addEventListener('click', () => {
    if (viewForwardStack.length === 0) return;
    isNavigatingHistory = true;
    const nextState = viewForwardStack.pop();    
    viewHistoryStack.push(nextState);            
    mapA.setView(nextState.center, nextState.zoom, { animate: true, duration: 0.4 });
    setTimeout(() => { isNavigatingHistory = false; updateNavButtonStatus(); }, 450);
});

// 跨窗口视口强制同步
let isSyncing = false;
function syncMaps(source, target) {
    source.on('move', () => {
        if (isSyncing) return;
        isSyncing = true;
        target.setView(source.getCenter(), source.getZoom(), { animate: false });
        isSyncing = false;
    });
}
syncMaps(mapA, mapB);
syncMaps(mapB, mapA);

// 要素识别弹窗
function onEachFeatureHandler(feature, layer) {
    layer.on('click', (e) => {
        if (activeTool !== 'identify') return;
        L.DomEvent.stopPropagation(e);
        let html = `<div class="property-popup"><h3>要素属性信息</h3><table>`;
        if (feature.properties && Object.keys(feature.properties).length > 0) {
            for (let key in feature.properties) { html += `<tr><th>${key}</th><td>${feature.properties[key]}</td></tr>`; }
        } else {
            html += `<tr><td colspan="2">无属性字段</td></tr>`;
        }
        html += `</table></div>`;
        L.popup().setLatLng(e.latlng).setContent(html).openOn(mapA);
    });
}

// 属性数据解码
function decodeDbfProperties(dbfBuffer) {
    if (!dbfBuffer) return [];
    const view = new DataView(dbfBuffer);
    const recordCount = view.getUint32(4, true);
    const headerLength = view.getUint16(8, true);
    const recordLength = view.getUint16(10, true);
    const fields = [];
    let offset = 32;
    while (offset < headerLength - 1) {
        const nameBytes = new Uint8Array(dbfBuffer, offset, 11);
        let end = nameBytes.indexOf(0);
        if (end === -1) end = 11;
        const name = new TextDecoder('gbk').decode(nameBytes.subarray(0, end)).replace(/\0/g, '').trim();
        const type = String.fromCharCode(view.getUint8(offset + 11));
        const length = view.getUint8(offset + 16);
        fields.push({ name, type, length });
        offset += 32;
    }
    const propertiesList = [];
    let recordOffset = headerLength;
    const gbkDecoder = new TextDecoder('gbk');
    for (let i = 0; i < recordCount; i++) {
        const props = {};
        let fieldOffset = 1; 
        for (const field of fields) {
            const rawBytes = new Uint8Array(dbfBuffer, recordOffset + fieldOffset, field.length);
            let valueStr = gbkDecoder.decode(rawBytes).trim();
            if (valueStr.includes('')) { try { valueStr = new TextDecoder('utf-8').decode(rawBytes).trim(); } catch(e){} }
            if (field.type === 'N' || field.type === 'F') { props[field.name] = valueStr === '' ? null : Number(valueStr); } 
            else { props[field.name] = valueStr.replace(/\0/g, ''); }
            fieldOffset += field.length;
        }
        propertiesList.push(props);
        recordOffset += recordLength;
    }
    return propertiesList;
}

async function handleShapefileUpload(fileInputId, targetGeoJsonLayer, targetMap) {
    const fileInput = document.getElementById(fileInputId);
    const files = fileInput.files;
    let shpFile, dbfFile;
    for (let i = 0; i < files.length; i++) {
        if (files[i].name.toLowerCase().endsWith('.shp')) shpFile = files[i];
        if (files[i].name.toLowerCase().endsWith('.dbf')) dbfFile = files[i];
    }
    if (!shpFile) { alert("未检测到有效 .shp 文件！请按住 Ctrl 键同时选择 .shp 和 .dbf 文件再点击打开。"); return; }
    try {
        const shpBuffer = await shpFile.arrayBuffer();
        const dbfBuffer = dbfFile ? await dbfFile.arrayBuffer() : undefined;
        let customProperties = dbfBuffer ? decodeDbfProperties(dbfBuffer) : [];
        targetGeoJsonLayer.clearLayers();
        let featureIndex = 0;
        const source = await shapefile.open(shpBuffer, undefined); 
        while (true) {
            const result = await source.read();
            if (result.done) break;
            const feature = result.value;
            if (customProperties[featureIndex]) { feature.properties = customProperties[featureIndex]; }
            targetGeoJsonLayer.addData(feature);
            featureIndex++;
        }
        const bounds = targetGeoJsonLayer.getBounds();
        if (bounds.isValid()) { targetMap.invalidateSize(); targetMap.fitBounds(bounds); }
    } catch (error) {
        console.error(error);
        alert("Shapefile 数据解析错误。");
    }
}

document.getElementById('btn-layerA').addEventListener('click', () => handleShapefileUpload('file-layerA', shpLayerA, mapA));
document.getElementById('btn-layerB').addEventListener('click', () => handleShapefileUpload('file-layerB', shpLayerB, mapB));

const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggle-btn');
toggleBtn.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    toggleBtn.classList.toggle('collapsed', isCollapsed);
    mapContainer.classList.toggle('full-width', isCollapsed);
    toggleBtn.innerHTML = isCollapsed ? '▶' : '◀';
    setTimeout(() => { mapA.invalidateSize(); mapB.invalidateSize(); if (currentMode !== 'off') renderSwipe(); }, 305);
});

document.getElementById('btn-home').addEventListener('click', () => mapA.setView(MIANYANG_CENTER, MIANYANG_ZOOM));


// --- 📐 👑 【空间交互测量引擎 V3 - 顶层提示与结果固化版】 ---
let measurePoints = [];
let drawingLayersA = L.layerGroup().addTo(mapA); 
let drawingLayersB = L.layerGroup().addTo(mapB); 

let guideLineA = null; 
let guideLineB = null; 

// 👑 动态构建并注入顶部操作引导提示牌 DOM
let topHintPanel = document.getElementById('gis-top-hint');
if (!topHintPanel) {
    topHintPanel = document.createElement('div');
    topHintPanel.id = 'gis-top-hint';
    // 设置符合主流B端运检大屏的拟物微拟伏悬浮样式
    Object.assign(topHintPanel.style, {
        position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.75)', color: '#fff', padding: '10px 20px',
        borderRadius: '4px', fontSize: '13px', zIndex: '2000', pointerEvents: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'none', letterSpacing: '0.5px',
        borderLeft: '4px solid #1890ff', fontFamily: 'sans-serif'
    });
    document.getElementById('main-container').appendChild(topHintPanel);
}

function setActiveTool(toolName) {
    activeTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    
    if (toolName === 'identify') {
        document.getElementById('btn-identify').classList.add('active');
        topHintPanel.style.display = 'none'; // 切换回识别自动关闭
    }
    if (toolName === 'distance') {
        document.getElementById('btn-measure-dist').classList.add('active');
        topHintPanel.innerHTML = `⚙️ <b>测距模式激活</b>：鼠标左键在地图任意位置点击打点，<b>双击或点击鼠标右键</b>结束量测并固定结果`;
        topHintPanel.style.display = 'block';
    }
    if (toolName === 'area') {
        document.getElementById('btn-measure-area').classList.add('active');
        topHintPanel.innerHTML = `⚙️ <b>测面模式激活</b>：鼠标左键依次点击拐点围成区域，<b>双击或点击鼠标右键</b>自动闭合图形并固定结果`;
        topHintPanel.style.display = 'block';
    }
    clearMeasurement();
}

function clearMeasurement() { 
    drawingLayersA.clearLayers(); 
    drawingLayersB.clearLayers(); 
    measurePoints = []; 
    if (guideLineA) { mapA.removeLayer(guideLineA); guideLineA = null; }
    if (guideLineB) { mapB.removeLayer(guideLineB); guideLineB = null; }
}

document.getElementById('btn-identify').classList.add('active');
document.getElementById('btn-identify').addEventListener('click', () => setActiveTool('identify'));
document.getElementById('btn-measure-dist').addEventListener('click', () => { setActiveTool('distance'); });
document.getElementById('btn-measure-area').addEventListener('click', () => { setActiveTool('area'); });

// 统一打点捕捉函数 (A/B两窗映射)
function handleMapClick(e) {
    if (activeTool === 'identify') return;
    if (e.originalEvent && e.originalEvent.detail > 1) return; 
    const latlng = e.latlng;
    measurePoints.push(latlng);
    
    L.circleMarker(latlng, { radius: 4, color: '#ff4d4f', fillColor: '#fff', fillOpacity: 1 }).addTo(drawingLayersA);
    L.circleMarker(latlng, { radius: 4, color: '#ff4d4f', fillColor: '#fff', fillOpacity: 1 }).addTo(drawingLayersB);
    
    if (activeTool === 'distance' && measurePoints.length > 1) { 
        const p1 = measurePoints[measurePoints.length - 2];
        L.polyline([p1, latlng], { color: '#ef4444', weight: 3 }).addTo(drawingLayersA);
        L.polyline([p1, latlng], { color: '#ef4444', weight: 3 }).addTo(drawingLayersB);
    }
}

// 统一动态悬浮线计算
function handleMapMouseMove(e) {
    if (activeTool === 'identify' || measurePoints.length === 0) return;
    const currentLngLat = e.latlng;
    
    if (guideLineA) { mapA.removeLayer(guideLineA); guideLineA = null; }
    if (guideLineB) { mapB.removeLayer(guideLineB); guideLineB = null; }

    let infoText = "";

    if (activeTool === 'distance') {
        let tempDist = 0;
        for(let i = 1; i < measurePoints.length; i++) { tempDist += measurePoints[i-1].distanceTo(measurePoints[i]); }
        tempDist += measurePoints[measurePoints.length - 1].distanceTo(currentLngLat);
        infoText = tempDist > 1000 ? (tempDist/1000).toFixed(2) + ' km' : tempDist.toFixed(0) + ' m';
        infoText = `当前长度: ${infoText}`;

        guideLineA = L.polyline([measurePoints[measurePoints.length - 1], currentLngLat], { color: '#ff4d4f', weight: 2, dashArray: '5, 5' }).addTo(mapA);
        guideLineB = L.polyline([measurePoints[measurePoints.length - 1], currentLngLat], { color: '#ff4d4f', weight: 2, dashArray: '5, 5' }).addTo(mapB);
    } 
    else if (activeTool === 'area' && measurePoints.length >= 1) {
        let tempLoop = [...measurePoints, currentLngLat];
        if (tempLoop.length === 2) {
            infoText = "请继续点击绘制面";
            guideLineA = L.polyline(tempLoop, { color: '#10b981', weight: 2, dashArray: '5, 5' }).addTo(mapA);
            guideLineB = L.polyline(tempLoop, { color: '#10b981', weight: 2, dashArray: '5, 5' }).addTo(mapB);
        } else {
            let area = calculatePlanarArea(tempLoop);
            let areaText = area > 1000000 ? (area/1000000).toFixed(2) + ' km²' : area.toFixed(0) + ' ㎡';
            infoText = `实时面积: ${areaText}`;

            guideLineA = L.polygon(tempLoop, { color: '#10b981', weight: 2, dashArray: '5, 5', fillColor: '#10b981', fillOpacity: 0.15 }).addTo(mapA);
            guideLineB = L.polygon(tempLoop, { color: '#10b981', weight: 2, dashArray: '5, 5', fillColor: '#10b981', fillOpacity: 0.15 }).addTo(mapB);
        }
    }

    if (guideLineA && infoText) guideLineA.bindTooltip(infoText, { sticky: true, offset: [15, 10], direction: 'right' }).openTooltip();
    if (guideLineB && infoText) guideLineB.bindTooltip(infoText, { sticky: true, offset: [15, 10], direction: 'right' }).openTooltip();
}

// 👑 【核心优化点】结束测量时，直接通过 permanent 机制无条件固化渲染最终结果
function finishMeasurement() {
    if (activeTool === 'identify' || measurePoints.length === 0) return;
    
    if (guideLineA) { mapA.removeLayer(guideLineA); guideLineA = null; }
    if (guideLineB) { mapB.removeLayer(guideLineB); guideLineB = null; }
    
    const uniquePoints = [];
    for(let p of measurePoints) { if(uniquePoints.length === 0 || p.distanceTo(uniquePoints[uniquePoints.length-1]) > 0.5) { uniquePoints.push(p); } }
    
    if (activeTool === 'distance' && uniquePoints.length >= 2) {
        let totalDist = 0;
        for(let i = 1; i < uniquePoints.length; i++) { totalDist += uniquePoints[i-1].distanceTo(uniquePoints[i]); }
        let text = totalDist > 1000 ? (totalDist/1000).toFixed(2) + ' km' : totalDist.toFixed(0) + ' m';
        
        const finalLineA = L.polyline(uniquePoints, { color: '#ef4444', weight: 4 }).addTo(drawingLayersA);
        const finalLineB = L.polyline(uniquePoints, { color: '#ef4444', weight: 4 }).addTo(drawingLayersB);

        // 👑 通过 permanent: true 属性强制固化文本，避免依赖 Popup 弹窗二次点击
        const tooltipConfig = { permanent: true, direction: 'top', className: 'gis-measure-result-label', offset: [0, -10] };
        finalLineA.bindTooltip(`<b>📏 总长:</b> ${text}`, tooltipConfig).openTooltip();
        finalLineB.bindTooltip(`<b>📏 总长:</b> ${text}`, tooltipConfig).openTooltip();
    } 
    else if (activeTool === 'area' && uniquePoints.length >= 3) {
        let area = calculatePlanarArea(uniquePoints);
        let text = area > 1000000 ? (area/1000000).toFixed(2) + ' km²' : area.toFixed(0) + ' ㎡';
        
        const finalPolyA = L.polygon(uniquePoints, { color: '#10b981', weight: 3, fillColor: '#10b981', fillOpacity: 0.3 }).addTo(drawingLayersA);
        const finalPolyB = L.polygon(uniquePoints, { color: '#10b981', weight: 3, fillColor: '#10b981', fillOpacity: 0.3 }).addTo(drawingLayersB);

        // 👑 自动固定在多边形几何中心位置显示面积
        const tooltipConfig = { permanent: true, direction: 'center', className: 'gis-measure-result-label' };
        finalPolyA.bindTooltip(`<b>▱ 面积:</b> ${text}`, tooltipConfig).openTooltip();
        finalPolyB.bindTooltip(`<b>▱ 面积:</b> ${text}`, tooltipConfig).openTooltip();
    }
    measurePoints = []; 
}

// 全域跨窗口双向监听挂载
[mapA, mapB].forEach((targetMap) => {
    targetMap.on('click', handleMapClick); 
    targetMap.on('mousemove', handleMapMouseMove);
    targetMap.on('contextmenu', (e) => { L.DomEvent.stopPropagation(e); finishMeasurement(); });
    targetMap.on('dblclick', (e) => { L.DomEvent.stopPropagation(e); finishMeasurement(); });
    targetMap.doubleClickZoom.disable(); 
});

function calculatePlanarArea(latlngs) {
    let radius = 6378137, prev = latlngs[latlngs.length - 1], ringArea = 0;
    for (let i = 0; i < latlngs.length; i++) {
        let curr = latlngs[i];
        ringArea += (curr.lng - prev.lng) * Math.PI / 180 * (2 + Math.sin(prev.lat * Math.PI / 180) + Math.sin(curr.lat * Math.PI / 180));
        prev = curr;
    }
    return Math.abs(ringArea * radius * radius / 2);
}

window.addEventListener('resize', () => { if (currentMode !== 'off') renderSwipe(); });
