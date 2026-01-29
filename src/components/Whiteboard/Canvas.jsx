import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Line as KonvaLine, Rect as KonvaRect, Circle as KonvaCircle, Arrow as KonvaArrow,
  Image as KonvaImage, Text as KonvaText, Group } from 'react-konva';
import useImage from 'use-image';


// Pomoćna funkcija za pretvaranje točaka u ravni niz brojeva -> VALJDA TAKO KONVA OČEKUJE
const flattenPoints = (ptsArray) => {
  // accepts [{x,y},...] or flat numeric array
  if (!ptsArray) return [];
  if (!Array.isArray(ptsArray)) return [];
  if (ptsArray.length === 0) return [];

  // Ako su brojevi, samo ih pretvara u brojeve
  if (typeof ptsArray[0] === 'number') return ptsArray.map(Number);

  // Pretvaraobjekte {x, y} u ravni niz [x1, y1, x2, y2 ...]
  return ptsArray.flatMap(p => [Number(p.x), Number(p.y)]);
};

// Funkcija za ograničavanje vrijednosti između minimuma i maksimuma
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const KonvaImageItem = ({ url, x, y, width, height }) => {
  // useImage se sada poziva unutar svake instance ove komponente posebno.
  const [img] = useImage(url, 'anonymous');

  // Ako je slika uspješno učitana, renderiram KonvaImage
  if (img) {
    return <KonvaImage image={img} x={x} y={y} width={width} height={height} />;
  }

  // Dok se slika učitava (ili ako ne uspije), prikazujem placeholder pravokutnik.
  return (<KonvaRect x={x} y={y} width={width} height={height} stroke="#888" dash={[4, 4]} fill="#fff" />);
};


// Prima ref iz roditeljske komponente
const Canvas = forwardRef(({ boardId, strokes, tool, color, fillColor, lineWidth, onStrokeSave, onStrokeDelete, onStrokeUpdate }, ref) => {
  const stageRef = useRef(null);     // na Konva Stage objekt

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current
  }));

  // pan offset (stage translation)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [currentPath, setCurrentPath] = useState([]); // array of {x,y}
  const [preview, setPreview] = useState(null); // { type, data } same shape as strokes

  // selection / drag
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState(null);

  // text & image UI
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewImg] = useImage(previewImage?.url || '', 'anonymous');

  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  // eraser cursor
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const ERASER_SIZE = 20;

  // responsive stage size
  const [stageSize, setStageSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 800,
    height: typeof window !== 'undefined' ? window.innerHeight - 60 : 600
  });

  // Za promjenu veličine prozora
  useEffect(() => {
    const handleResize = () => setStageSize({ width: window.innerWidth, height: window.innerHeight - 60 });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Funkcija za izračun granica (bounding box) stroke
  const getBounds = useCallback((stroke) => {
    if (!stroke || !stroke.data) return null;
    const { type, data } = stroke;
    let b = null;

    switch (type) {
      case 'rectangle':
        b = { x: Number(data.x), y: Number(data.y), width: Number(data.width), height: Number(data.height) };
        break;
      case 'circle':
        b = { x: Number(data.x) - Number(data.radius), y: Number(data.y) - Number(data.radius), width: Number(data.radius) * 2, height: Number(data.radius) * 2 };
        break;
      case 'line': {
        if (!Array.isArray(data.points) || data.points.length === 0) return null;

        const xs = data.points.map(p => Number(p.x));
        const ys = data.points.map(p => Number(p.y));
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);

        b = { x: minX - 3, y: minY - 3, width: Math.max(6, maxX - minX + 6), height: Math.max(6, maxY - minY + 6) };
        break;
      }
      case 'arrow': {
        if (data.points && data.points.length >= 2) {
          const xs = data.points.map(p => Number(p.x));
          const ys = data.points.map(p => Number(p.y));
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          b = { x: minX - 3, y: minY - 3, width: Math.max(6, maxX - minX + 6), height: Math.max(6, maxY - minY + 6) };
        } else if (typeof data.x1 !== 'undefined') {
          const minX = Math.min(Number(data.x1), Number(data.x2));
          const minY = Math.min(Number(data.y1), Number(data.y2));
          const maxX = Math.max(Number(data.x1), Number(data.x2));
          const maxY = Math.max(Number(data.y1), Number(data.y2));
          b = { x: minX - 3, y: minY - 3, width: Math.max(6, maxX - minX + 6), height: Math.max(6, maxY - minY + 6) };
        }
        break;
      }
      case 'text': {
        const fontSize = Number(data.fontSize || 20);
        const padding = 4;
        const width = (data.text?.length || 0) * fontSize * 0.6;
        b = { x: Number(data.x) - padding, y: Number(data.y) - fontSize - padding, width: width + padding * 2, height: fontSize + padding * 2 };
        break;
      }
      case 'image':
        b = { x: Number(data.x), y: Number(data.y), width: Number(data.width), height: Number(data.height) };
        break;
      default:
        return null;
    }

    if (!b) return null;

    return { x: b.x, y: b.y, width: Math.max(6, b.width), height: Math.max(6, b.height) };
  }, []);

  // Pretvara poziciju pokazivača na stage u koordinate na ploči (uzimajući u obzir panOffset)
  const pointerToBoard = useCallback((pointer) => {
    if (!pointer) return null;
    return { x: pointer.x - panOffset.x, y: pointer.y - panOffset.y };
  }, [panOffset]);



  const onStageMouseDown = (e) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const boardPos = pointerToBoard(pointer);
    setLastMouse({ x: pointer.x, y: pointer.y });

    // HAND TOOL - pomicanje canvasa (VJEROJATNO USELESS JER SAM HTIO
    // NEŠTO KAO ONE NOTE DA MOŽE BITI NEAR-INFINITE CANVAS AKO SE POMAKNE IZVAN ORIGINAL BOUNDS...)
    if (tool === 'hand') {
      stage.draggable(true);
      stage.startDrag(e.evt);
      return;
    }

    if (tool === 'select') {
      // Traži od najvišeg objekta koji je kliknut prema najnižem
      let found = null;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const b = getBounds(strokes[i]);
        if (!b) continue;
        if (boardPos.x >= b.x && boardPos.x <= b.x + b.width && boardPos.y >= b.y && boardPos.y <= b.y + b.height) {
          found = i;
          break;
        }
      }

      if (found !== null) {
        setSelectedIndex(found);
      } else {
        setSelectedIndex(null);
      }
      return;
    }

    if (tool === 'eraser') {
      setIsDrawing(true);
      setStartPos(boardPos);
      return;
    }

    if (tool === 'text') {
      setTextPos(boardPos);
      setShowTextInput(true);
      setTextInput('');
      return;
    }

    if (tool === 'image') {
      setTextPos(boardPos);
      setShowImageModal(true);
      return;
    }

    // Ostali alati za crtanje:
    if (['pen', 'line', 'rectangle', 'circle', 'arrow'].includes(tool)) {
      setIsDrawing(true);
      setStartPos(boardPos);
      if (tool === 'pen') {
        setCurrentPath([boardPos]);
        setPreview({
          type: 'line',
          data: { points: [{ x: boardPos.x, y: boardPos.y }], color, width: lineWidth }
        });
      } else if (tool === 'line' || tool === 'arrow') {
        setPreview({ type: tool, data: { points: [{ x: boardPos.x, y: boardPos.y }, { x: boardPos.x, y: boardPos.y }], color, width: lineWidth } });
      } else if (tool === 'rectangle') {
        setPreview({ type: 'rectangle', data: { x: boardPos.x, y: boardPos.y, width: 0, height: 0, color, fillColor, lineWidth } });
      } else if (tool === 'circle') {
        setPreview({ type: 'circle', data: { x: boardPos.x, y: boardPos.y, radius: 0, color, fillColor, lineWidth } });
      }
      return;
    }
  };



  const onStageMouseMove = (e) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const boardPos = pointerToBoard(pointer);
    if (!boardPos) return;

    setLastMouse({ x: pointer.x, y: pointer.y });

    // Gumica - I GUESS THIS WORKS???
    if (tool === 'eraser' && isDrawing) {
      strokes.forEach((s, idx) => {
        const b = getBounds(s);
        if (!b) return;
        if (!(boardPos.x >= b.x - ERASER_SIZE && boardPos.x <= b.x + b.width + ERASER_SIZE &&
          boardPos.y >= b.y - ERASER_SIZE && boardPos.y <= b.y + b.height + ERASER_SIZE)) return;
        if (s.type === 'line' && Array.isArray(s.data.points)) {
          for (let i = 0; i < s.data.points.length - 1; i++) {
            const a = s.data.points[i];
            const bpt = s.data.points[i + 1];
            const dx = bpt.x - a.x;
            const dy = bpt.y - a.y;
            const l2 = dx * dx + dy * dy;
            let t = 0;
            if (l2 !== 0) {
              t = ((boardPos.x - a.x) * dx + (boardPos.y - a.y) * dy) / l2;
              t = clamp(t, 0, 1);
            }
            const projx = a.x + t * dx;
            const projy = a.y + t * dy;
            const dist = Math.hypot(boardPos.x - projx, boardPos.y - projy);
            if (dist <= ERASER_SIZE / 2) {
              onStrokeDelete(idx);
              break;
            }
          }
        } else {
          if (boardPos.x >= b.x && boardPos.x <= b.x + b.width && boardPos.y >= b.y && boardPos.y <= b.y + b.height) {
            onStrokeDelete(idx);
          }
        }
      });
      return;
    }

    // Ako se Stage povlači -> USELESS JER NE RADI BAŠ ONO ŠTO SAM HTIO
    if (tool === 'hand' && stage.isDragging && stage.isDragging()) {
      setPanOffset({ x: stage.x(), y: stage.y() });
      return;
    }

    // Dok se crta prikazuje se preview update
    if (isDrawing && preview && ['line', 'rectangle', 'circle', 'arrow'].includes(preview.type) || (tool === 'pen' && isDrawing)) {
      const t = preview ? preview.type : tool;
      if (tool === 'line') {
        setPreview({
          ...preview,
          data: { ...preview.data, points: [preview.data.points[0], { x: boardPos.x, y: boardPos.y }], color, width: lineWidth }
        });
      } else if (tool === 'pen') {
        const prevPoints = preview?.data?.points ? preview.data.points.slice() : currentPath.slice();
        prevPoints.push({ x: boardPos.x, y: boardPos.y });
        setPreview({ type: 'line', data: { points: prevPoints, color, width: lineWidth } });
        setCurrentPath(prev => [...prev, { x: boardPos.x, y: boardPos.y }]);
      } else if (t === 'arrow' || t === 'line') {
        setPreview({ ...preview, data: { ...preview.data, points: [preview.data.points[0], { x: boardPos.x, y: boardPos.y }], color, width: lineWidth } });
      } else if (t === 'rectangle') {
        const x = Math.min(startPos.x, boardPos.x);
        const y = Math.min(startPos.y, boardPos.y);
        const w = Math.abs(boardPos.x - startPos.x);
        const h = Math.abs(boardPos.y - startPos.y);
        setPreview({ type: 'rectangle', data: { x, y, width: w, height: h, color, fillColor, lineWidth } });
      } else if (t === 'circle') {
        const r = Math.hypot(boardPos.x - startPos.x, boardPos.y - startPos.y);
        setPreview({ type: 'circle', data: { x: startPos.x, y: startPos.y, radius: r, color, fillColor, lineWidth } });
      }
    }
  };

  

  const onStageMouseUp = (e) => {
    const stage = stageRef.current;
    if (!stage) return;

    if (tool === 'hand' && stage.isDragging && stage.isDragging()) {
      stage.stopDrag();
      stage.draggable(false);
      setPanOffset({ x: stage.x(), y: stage.y() });
      return;
    }

    if (isDrawing && preview) {
      // validation: if line has <2 points -> cancel
      if (preview.type === 'line' && (!preview.data.points || preview.data.points.length < 2)) {
        setIsDrawing(false);
        setPreview(null);
        setCurrentPath([]);
        setStartPos(null);
        return;
      }
      
      // Spremam na backend
      try {
        onStrokeSave({ type: preview.type, data: preview.data });
      } catch (err) {
        console.error('failed to save stroke', err);
      }
      setIsDrawing(false);
      setPreview(null);
      setCurrentPath([]);
      setStartPos(null);
      return;
    }

    // reset flags
    setIsDrawing(false);
    setIsDragging(false);
    setDragStartPos(null);
  };


  // Tekst na ploči
  const commitText = (x, y, text) => {
    const data = { text, x: Number(x), y: Number(y), color, fontSize: Math.max(16, lineWidth * 5) };
    onStrokeSave({ type: 'text', data });
  };

  // Slika na ploči
  const commitImage = (x, y, url) => {
    const data = { url, x: Number(x), y: Number(y), width: 300, height: 200 };
    // pre-load for local rendering
    onStrokeSave({ type: 'image', data });
  };

  
  // Renderira sve postojeće strokes kao Knova objekte
  const renderKonvaShapes = () => {
    return strokes.map((s, idx) => {
      if (!s || !s.data) return null;
      const d = s.data;
      const t = s.type;
      const isSelected = selectedIndex === idx;
      const bounds = getBounds(s);
      if (!bounds) return null;

      const uniqueKey = s.id ? `shape-${s.id}-${s.type}-${idx}` : `temp-${idx}`;

      // Grupa za drag/select
      return (
        <Group
          key={uniqueKey}
          draggable={tool === 'select' && selectedIndex === idx}
          onClick={() => setSelectedIndex(idx)}
          onDragEnd={(e) => {
            const node = e.target;
            const dx = node.x();
            const dy = node.y();

            // VAŽNO: reset local transform
            node.x(0);
            node.y(0);

            const newData = structuredClone(s.data);

            switch (s.type) {
              case 'line':
              case 'arrow': {
                newData.points = newData.points.map(p => ({
                  x: p.x + dx,
                  y: p.y + dy
                }));
                break;
              }
              case 'rectangle':
              case 'circle':
              case 'image':
              case 'text': {
                newData.x += dx;
                newData.y += dy;
                break;
              }
            }

            console.log('📡 Broadcast stroke update:', idx, newData);
            onStrokeUpdate(idx, { type: s.type, data: newData });
          }}
        >
          {/* Render shape */}
          {t === 'line' && <KonvaLine points={flattenPoints(d.points)} stroke={d.color || '#000'} strokeWidth={d.width || d.lineWidth || 2} lineCap="round" lineJoin="round" hitStrokeWidth={20} listening={true} />}
          {t === 'arrow' && <KonvaArrow points={d.points && d.points.length >= 2 ? flattenPoints(d.points) : [d.x1, d.y1, d.x2, d.y2]} stroke={d.color || '#000'} strokeWidth={d.width || d.lineWidth || 2} pointerLength={15} pointerWidth={10} hitStrokeWidth={20} listening={true} />}
          {t === 'rectangle' && <KonvaRect x={d.x} y={d.y} width={d.width} height={d.height} stroke={d.color || '#000'} fill={d.fillColor || 'transparent'} strokeWidth={d.lineWidth || 2} />}
          {t === 'circle' && <KonvaCircle x={d.x} y={d.y} radius={d.radius} stroke={d.color || '#000'} fill={d.fillColor || 'transparent'} strokeWidth={d.lineWidth || 2} />}
          {t === 'text' && <KonvaText x={d.x} y={d.y - (d.fontSize || 20)} text={d.text} fontSize={d.fontSize || 20} fill={d.color || '#000'} />}
          {t === 'image' && (<KonvaImageItem url={d.url} x={d.x} y={d.y} width={d.width} height={d.height} />)}
        </Group>
      );
    });
  };


  // Renderira preview (privremeni oblik tijekom crtanja)
  const renderPreview = () => {
    if (!preview || !preview.data) return null;
    const p = preview;
    switch (p.type) {
      case 'line': {
        const pts = flattenPoints(p.data.points);
        if (pts.length < 4) return null;
        return <KonvaLine points={pts} stroke={p.data.color || '#000'} strokeWidth={p.data.width || 2} lineCap="round" lineJoin="round" />;
      }
      case 'arrow': {
        const pts = p.data.points ? flattenPoints(p.data.points) : [];
        if (pts.length < 4) return null;
        return <KonvaArrow points={pts} stroke={p.data.color || '#000'} strokeWidth={p.data.width || 2} pointerLength={15} pointerWidth={10} />;
      }
      case 'rectangle':
        return <KonvaRect x={p.data.x} y={p.data.y} width={p.data.width} height={p.data.height} stroke={p.data.color} fill={p.data.fillColor} strokeWidth={p.data.lineWidth} />;
      case 'circle':
        return <KonvaCircle x={p.data.x} y={p.data.y} radius={p.data.radius} stroke={p.data.color} fill={p.data.fillColor} strokeWidth={p.data.lineWidth} />;
      case 'text':
        return <KonvaText x={p.data.x} y={p.data.y - (p.data.fontSize || 20)} text={p.data.text} fontSize={p.data.fontSize || 20} fill={p.data.color} />;
      case 'image': {
        // Prioritet ima previewImage (lokalni state), a zatim podaci iz preview objekta.
        const url = previewImage?.url || p.data.url;
        const x = previewImage?.x || p.data.x;
        const y = previewImage?.y || p.data.y;
        
        // Pozivam istu pomoćnu komponentu za konzistentan prikaz.
        return (<KonvaImageItem url={url} x={x} y={y} width={300} height={200} />);
      }
      default:
        return null;
    }
  };



  useEffect(() => {
    return () => {
      const stage = stageRef.current;
      if (stage && stage.isDragging && stage.isDragging()) {
        stage.stopDrag();
      }
    };
  }, []);


  // Renderiranje komponente
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        style={{ cursor:
          tool === 'hand' ? 'grab' :
          tool === 'select' ? 'pointer' :
          tool === 'eraser' ? 'none' :
          'crosshair'
        }}
      >
        <Layer x={panOffset.x} y={panOffset.y}>
          {/* background (draw only the portion covering stage - does not "white-out" whole UI) */}
          <KonvaRect x={-panOffset.x} y={-panOffset.y} width={stageSize.width} height={stageSize.height} fill="#ffffff" listening={false} />
          {/* render existing strokes */}
          {renderKonvaShapes()}

          {/* render preview on top */}
          {renderPreview()}

          {/* render preview image if exists */}
          {previewImage && (
            previewImg
              ? <KonvaImage image={previewImg} x={previewImage.x} y={previewImage.y} width={previewImage.width} height={previewImage.height} />
              : <KonvaRect x={previewImage.x} y={previewImage.y} width={previewImage.width} height={previewImage.height} stroke="#888" dash={[4,4]} fill="#fff" />
          )}
        </Layer>
      </Stage>

      {/* Eraser cursor */}
      {tool === 'eraser' && (
        <div
          style={{
            position: 'absolute',
            left: `${lastMouse.x - ERASER_SIZE / 2}px`,
            top: `${lastMouse.y - ERASER_SIZE / 2}px`,
            width: ERASER_SIZE,
            height: ERASER_SIZE,
            border: '2px solid black',
            borderRadius: 2,
            pointerEvents: 'none',
            transform: 'translate(0,0)'
          }}
        />
      )}

      {/* Text input overlay */}
      {showTextInput && textPos && (
        <div style={{
          position: 'absolute',
          left: `${textPos.x + panOffset.x}px`,
          top: `${textPos.y + panOffset.y - 10}px`,
          zIndex: 1000,
          background: '#0b1220',
          padding: 8,
          borderRadius: 6,
          boxShadow: '0 6px 20px rgba(0,0,0,0.4)'
        }}>
          <input
            autoFocus
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitText(textPos.x, textPos.y, textInput);
                setShowTextInput(false); setTextInput('');
              } else if (e.key === 'Escape') {
                setShowTextInput(false); setTextInput('');
              }
            }}
            style={{
              fontSize: Math.max(16, lineWidth * 5),
              padding: '6px 10px',
              minWidth: 160,
              color: '#fff',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              outline: 'none'
            }}
            placeholder="Type text..."
          />
        </div>
      )}

      {/* Image modal */}
      {showImageModal && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: 'rgba(2,6,23,0.7)', zIndex: 2000
        }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 10, width: 420, boxShadow: '0 12px 40px rgba(2,6,23,0.4)' }}>
            <h3 style={{ margin: 0, marginBottom: 8, color: '#111' }}>Umetni sliku preko URL-a</h3>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              style={{ width: '100%', padding: 10, marginBottom: 12, border: '1px solid #ddd', borderRadius: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowImageModal(false); setImageUrl(''); }} style={{ padding: '8px 12px' }}>Odustani</button>
              <button onClick={() => {
                if (imageUrl && textPos) {
                  setPreviewImage({ url: imageUrl, x: textPos.x, y: textPos.y, width: 300, height: 200 });
                  commitImage(textPos.x, textPos.y, imageUrl);
                  setShowImageModal(false);
                  setImageUrl('');
                }
              }} style={{ padding: '8px 12px', background: '#2563eb', color: '#fff', borderRadius: 6 }}>Dodaj</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Canvas;