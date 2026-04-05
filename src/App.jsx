import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot,
  addDoc, deleteDoc, setDoc
} from "firebase/firestore";

// ── 預設分類（大類 + 小類）─────────────────────────────
const DEFAULT_CATEGORIES = [
  {
    id: "food", label: "餐飲", icon: "🍜", img: null,
    sub: [
      { id: "food-eat",   label: "外食",  icon: "🍱", img: null },
      { id: "food-cafe",  label: "咖啡",  icon: "☕", img: null },
      { id: "food-drink", label: "飲料",  icon: "🧋", img: null },
      { id: "food-cook",  label: "食材",  icon: "🥦", img: null },
    ],
  },
  {
    id: "transport", label: "交通", icon: "🚇", img: null,
    sub: [
      { id: "tp-mrt",  label: "捷運/公車", icon: "🚌", img: null },
      { id: "tp-taxi", label: "計程車",    icon: "🚕", img: null },
      { id: "tp-gas",  label: "加油",      icon: "⛽", img: null },
    ],
  },
  {
    id: "entertainment", label: "娛樂", icon: "🎬", img: null,
    sub: [
      { id: "en-movie",  label: "電影",  icon: "🎞️", img: null },
      { id: "en-game",   label: "遊戲",  icon: "🎮", img: null },
      { id: "en-travel", label: "旅遊",  icon: "✈️", img: null },
    ],
  },
  {
    id: "shopping", label: "購物", icon: "🛍️", img: null,
    sub: [
      { id: "sh-cloth",  label: "衣物",   icon: "👗", img: null },
      { id: "sh-beauty", label: "保養",   icon: "🧴", img: null },
      { id: "sh-home",   label: "家用品", icon: "🪣", img: null },
    ],
  },
  {
    id: "health", label: "醫療", icon: "💊", img: null,
    sub: [
      { id: "he-clinic",  label: "門診",  icon: "🏥", img: null },
      { id: "he-pharma",  label: "藥品",  icon: "💉", img: null },
      { id: "he-fitness", label: "健身",  icon: "🏋️", img: null },
    ],
  },
  {
    id: "home", label: "居家", icon: "🏠", img: null,
    sub: [
      { id: "ho-rent",   label: "房租",  icon: "🔑", img: null },
      { id: "ho-util",   label: "水電",  icon: "💡", img: null },
      { id: "ho-repair", label: "維修",  icon: "🔧", img: null },
    ],
  },
  {
    id: "education", label: "學習", icon: "📚", img: null,
    sub: [
      { id: "ed-book",   label: "書籍",  icon: "📖", img: null },
      { id: "ed-course", label: "課程",  icon: "🎓", img: null },
    ],
  },
  {
    id: "other", label: "其他", icon: "✦", img: null,
    sub: [
      { id: "ot-gift",  label: "禮物",  icon: "🎁", img: null },
      { id: "ot-misc",  label: "雜項",  icon: "📌", img: null },
    ],
  },
];

const PAYMENT_METHODS = [
  { id: "cash",     label: "現金",   icon: "💵" },
  { id: "card",     label: "信用卡", icon: "💳" },
  { id: "transfer", label: "轉帳",   icon: "🏦" },
];

const P = {
  bg: "#F7F4EF", card: "#FFFFFF", muted: "#9A9080",
  accent: "#7C9E87", accentLight: "#EBF3EE",
  border: "#E8E2D9", warm: "#C8956C", warmLight: "#FAF0E8",
  ink: "#4A4035", danger: "#e07070",
};

function today() { return new Date().toISOString().slice(0, 10); }
function fmt(n)  { return "NT$ " + Number(n).toLocaleString(); }
function uid()   { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── helpers ──────────────────────────────────────────
function findMain(cats, mainId) { return cats.find(c => c.id === mainId); }
function findSub(cats, mainId, subId) {
  const m = findMain(cats, mainId);
  return m?.sub?.find(s => s.id === subId);
}
function CatThumb({ item, size = 20, box = 36 }) {
  return (
    <div style={{ width: box, height: box, borderRadius: box * 0.28, background: P.accentLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size, flexShrink: 0, overflow: "hidden" }}>
      {item?.img ? <img src={item.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (item?.icon || "✦")}
    </div>
  );
}
function Tag({ children, color = P.accent, bg = P.accentLight }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 6, padding: "2px 8px" }}>{children}</span>;
}

// ══════════════════════════════════════════════════════
// 計算機
// ══════════════════════════════════════════════════════
function Calculator({ initial = "", calcIcon, onConfirm, onClose }) {
  const [expr, setExpr] = useState(initial ? String(initial) : "");
  const [disp, setDisp] = useState(initial ? String(initial) : "0");

  function press(v) {
    if (v === "C")  { setExpr(""); setDisp("0"); return; }
    if (v === "⌫")  { const n = expr.slice(0,-1); setExpr(n); setDisp(n||"0"); return; }
    if (v === "=")  {
      try {
        const safe = expr.replace(/[^0-9+\-*/().]/g, "");
        // eslint-disable-next-line no-new-func
        const r = Math.round(Function('"use strict";return(' + safe + ')')() * 100) / 100;
        setDisp(String(r)); setExpr(String(r));
      } catch { setDisp("錯誤"); }
      return;
    }
    const n = expr + v; setExpr(n); setDisp(n);
  }

  const ROWS = [["C","⌫","%","÷"],["7","8","9","×"],["4","5","6","−"],["1","2","3","+"],[" ","0",".","="]];
  const OP = { "÷":"/","×":"*","−":"-","%":"/100*" };
  function bc(v) {
    if (v === "=")            return { bg: P.accent,     fg: "#fff" };
    if ("C⌫".includes(v))    return { bg: "#fde8e8",    fg: P.danger };
    if ("÷×−+%".includes(v)) return { bg: P.warmLight,  fg: P.warm };
    return { bg: "#f5f3ef", fg: P.ink };
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(44,44,44,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1100,backdropFilter:"blur(3px)" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:P.card,borderRadius:"24px 24px 0 0",padding:"20px 16px 32px",width:"100%",maxWidth:420 }}>
        <div style={{ background:P.bg,borderRadius:14,padding:"14px 18px",marginBottom:14,minHeight:60,display:"flex",flexDirection:"column",alignItems:"flex-end" }}>
          <div style={{ fontSize:13,color:P.muted,minHeight:18,wordBreak:"break-all" }}>{expr||" "}</div>
          <div style={{ fontSize:32,fontWeight:700,color:P.ink,letterSpacing:-1 }}>{disp}</div>
        </div>
        {ROWS.map((row,ri)=>(
          <div key={ri} style={{ display:"flex",gap:8,marginBottom:8 }}>
            {row.map(v=>{
              if(v===" ") return <div key={v} style={{ flex:1 }} />;
              const mapped = OP[v]||v;
              const {bg,fg} = bc(v);
              return <button key={v} onClick={()=>press(mapped)} style={{ flex:1,padding:"15px 0",borderRadius:12,border:"none",background:bg,color:fg,fontSize:18,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>{v}</button>;
            })}
          </div>
        ))}
        <button onClick={()=>{ const n=parseFloat(disp); if(!isNaN(n)&&n>0) onConfirm(n); else onClose(); }}
          style={{ width:"100%",padding:14,background:P.accent,color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:4,letterSpacing:1,fontFamily:"inherit" }}>
          確認金額
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// QR Scanner
// ══════════════════════════════════════════════════════
function QRScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [status, setStatus] = useState("啟動相機中…");
  const [err, setErr] = useState("");

  function scan() {
    const v = videoRef.current, c = canvasRef.current;
    if (!v||!c||v.readyState!==4) { rafRef.current=requestAnimationFrame(scan); return; }
    c.width=v.videoWidth; c.height=v.videoHeight;
    const ctx=c.getContext("2d"); ctx.drawImage(v,0,0);
    const img=ctx.getImageData(0,0,c.width,c.height);
    if(window.jsQR){ const code=window.jsQR(img.data,img.width,img.height); if(code){ parse(code.data); return; } }
    rafRef.current=requestAnimationFrame(scan);
  }

  function startCam() {
    navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}}).then(s=>{
      streamRef.current=s;
      if(videoRef.current){ videoRef.current.srcObject=s; videoRef.current.play(); setStatus("對準發票 QR Code"); rafRef.current=requestAnimationFrame(scan); }
    }).catch(()=>setErr("無法存取相機，請確認已授予相機權限。"));
  }

  useEffect(()=>{
    if(!window.jsQR){ const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js"; s.onload=startCam; document.head.appendChild(s); } else startCam();
    return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop()); };
  }, []);

  function parse(raw) {
    if(rafRef.current) cancelAnimationFrame(rafRef.current);
    if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    const data={raw,invoiceNo:"",date:"",amount:"",items:[]};
    try {
      if(/^[A-Z]{2}\d{8}/.test(raw)){
        data.invoiceNo=raw.slice(0,10);
        const roc=raw.slice(10,17);
        data.date=`${+roc.slice(0,3)+1911}-${roc.slice(3,5)}-${roc.slice(5,7)}`;
        const taxed=parseInt(raw.slice(33,41),16);
        if(!isNaN(taxed)&&taxed>0) data.amount=taxed;
        const rest=raw.slice(54);
        if(rest&&rest!=="**"){ const p=rest.split(":"); for(let i=0;i+2<p.length;i+=3) if(p[i]) data.items.push({name:p[i],qty:+p[i+1]||1,price:+p[i+2]||0}); }
      }
    } catch {}
    onResult(data);
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"#000",zIndex:1200,display:"flex",flexDirection:"column" }}>
      <div style={{ padding:"20px 16px 10px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div style={{ color:"#fff",fontSize:16,fontWeight:700 }}>掃描電子發票</div>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",padding:"6px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit" }}>關閉</button>
      </div>
      {err ? <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#fca5a5",fontSize:14,padding:24,textAlign:"center" }}>{err}</div>
           : <div style={{ flex:1,position:"relative",overflow:"hidden" }}>
               <video ref={videoRef} style={{ width:"100%",height:"100%",objectFit:"cover" }} playsInline muted />
               <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
                 <div style={{ width:220,height:220,position:"relative" }}>
                   {[{top:0,left:0},{top:0,right:0,transform:"scaleX(-1)"},{bottom:0,left:0,transform:"scaleY(-1)"},{bottom:0,right:0,transform:"scale(-1)"}].map((st,i)=>(
                     <div key={i} style={{ position:"absolute",width:36,height:36,borderTop:`3px solid ${P.accent}`,borderLeft:`3px solid ${P.accent}`,borderRadius:"8px 0 0 0",...st }} />
                   ))}
                 </div>
               </div>
               <canvas ref={canvasRef} style={{ display:"none" }} />
             </div>}
      <div style={{ padding:"12px 16px 32px",color:"rgba(255,255,255,0.7)",fontSize:13,textAlign:"center" }}>{err||status}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 設定頁
// ══════════════════════════════════════════════════════
function SettingsTab({ categories, setCategories, calcIcon, setCalcIcon }) {
  const [expandedMain, setExpandedMain] = useState(null);
  const [editMain, setEditMain] = useState(null);
  const [editSub,  setEditSub]  = useState(null);
  const [draftMain, setDraftMain] = useState({ label:"", icon:"", img:null });
  const [draftSub,  setDraftSub]  = useState({ label:"", icon:"", img:null });
  const mainImgRef = useRef(null);
  const subImgRef  = useRef(null);
  const calcImgRef = useRef(null);

  function imgReader(file, cb) {
    const r = new FileReader(); r.onload = e => cb(e.target.result); r.readAsDataURL(file);
  }

  function saveMain() {
    if (!draftMain.label.trim()) return;
    if (editMain === "new") {
      setCategories(p=>[...p,{ id:uid(),label:draftMain.label.trim(),icon:draftMain.icon||"✦",img:draftMain.img,sub:[] }]);
    } else {
      setCategories(p=>p.map(c=>c.id===editMain?{...c,label:draftMain.label,icon:draftMain.icon,img:draftMain.img}:c));
    }
    setEditMain(null);
  }
  function deleteMain(id) { setCategories(p=>p.filter(c=>c.id!==id)); }

  function saveSub() {
    if (!draftSub.label.trim()) return;
    setCategories(p=>p.map(c=>{
      if(c.id!==editSub.mainId) return c;
      if(editSub.subId==="new") return {...c,sub:[...c.sub,{id:uid(),label:draftSub.label.trim(),icon:draftSub.icon||"✦",img:draftSub.img}]};
      return {...c,sub:c.sub.map(s=>s.id===editSub.subId?{...s,label:draftSub.label,icon:draftSub.icon,img:draftSub.img}:s)};
    }));
    setEditSub(null);
  }
  function deleteSub(mainId, subId) {
    setCategories(p=>p.map(c=>c.id===mainId?{...c,sub:c.sub.filter(s=>s.id!==subId)}:c));
  }

  const inputSt = { width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${P.border}`,fontSize:13,color:P.ink,outline:"none",background:P.bg,boxSizing:"border-box",fontFamily:"inherit" };
  const btnSt   = (bg,cl) => ({ padding:"7px 12px",borderRadius:9,border:"none",background:bg,color:cl,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0 });

  return (
    <div>
      {/* 計算機圖示 */}
      <div style={{ fontSize:13,fontWeight:700,color:P.ink,marginBottom:10 }}>計算機按鈕圖示</div>
      <div style={{ background:P.card,borderRadius:14,padding:"12px 14px",marginBottom:18,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",gap:12 }}>
        <div style={{ width:48,height:48,borderRadius:13,background:P.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,overflow:"hidden",cursor:"pointer",flexShrink:0 }}
          onClick={()=>calcImgRef.current?.click()}>
          {calcIcon?.img ? <img src={calcIcon.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                         : <span>{calcIcon?.emoji||"🧮"}</span>}
        </div>
        <div style={{ flex:1 }}>
          <input value={calcIcon?.emoji||""} onChange={e=>setCalcIcon(ci=>({...ci,emoji:e.target.value,img:null}))}
            placeholder="Emoji 圖示" style={{ ...inputSt,marginBottom:6 }} />
          <button onClick={()=>calcImgRef.current?.click()} style={{ ...btnSt(P.warmLight,P.warm),fontSize:11 }}>上傳圖片</button>
          <input ref={calcImgRef} type="file" accept="image/*" style={{ display:"none" }}
            onChange={e=>{ const f=e.target.files?.[0]; if(f) imgReader(f,d=>setCalcIcon({emoji:"",img:d})); }} />
        </div>
      </div>

      {/* 分類管理 */}
      <div style={{ fontSize:13,fontWeight:700,color:P.ink,marginBottom:10 }}>管理分類</div>

      {categories.map(cat=>(
        <div key={cat.id} style={{ background:P.card,borderRadius:14,marginBottom:10,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          {editMain===cat.id ? (
            <div style={{ padding:"12px 14px" }}>
              <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8 }}>
                <div style={{ width:42,height:42,borderRadius:11,background:P.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,overflow:"hidden",flexShrink:0,cursor:"pointer" }}
                  onClick={()=>mainImgRef.current?.click()}>
                  {draftMain.img?<img src={draftMain.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />:(draftMain.icon||"✦")}
                </div>
                <input value={draftMain.label} onChange={e=>setDraftMain(d=>({...d,label:e.target.value}))} placeholder="大分類名稱" style={{ ...inputSt,flex:1 }} />
              </div>
              <div style={{ display:"flex",gap:8,marginBottom:8 }}>
                <input value={draftMain.icon} onChange={e=>setDraftMain(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{ ...inputSt,flex:1,fontSize:16 }} />
                <button onClick={()=>mainImgRef.current?.click()} style={btnSt(P.warmLight,P.warm)}>上傳圖片</button>
                <input ref={mainImgRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ const f=e.target.files?.[0]; if(f) imgReader(f,d=>setDraftMain(dm=>({...dm,img:d,icon:""}))); }} />
              </div>
              <div style={{ display:"flex",gap:8 }}>
                <button onClick={saveMain}              style={{ ...btnSt(P.accent,"#fff"),flex:1 }}>儲存</button>
                <button onClick={()=>setEditMain(null)} style={{ ...btnSt(P.border,P.muted),flex:1 }}>取消</button>
              </div>
            </div>
          ) : (
            <div style={{ padding:"11px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer" }}
              onClick={()=>setExpandedMain(v=>v===cat.id?null:cat.id)}>
              <CatThumb item={cat} size={18} box={34} />
              <span style={{ flex:1,fontSize:14,fontWeight:600,color:P.ink }}>{cat.label}</span>
              <span style={{ fontSize:11,color:P.muted,marginRight:4 }}>{cat.sub.length} 小類</span>
              <button onClick={e=>{ e.stopPropagation(); setEditMain(cat.id); setDraftMain({label:cat.label,icon:cat.icon,img:cat.img||null}); }}
                style={{ ...btnSt("none",P.accent),border:`1px solid ${P.accent}`,padding:"3px 9px" }}>編輯</button>
              <button onClick={e=>{ e.stopPropagation(); deleteMain(cat.id); }}
                style={{ ...btnSt("none",P.muted),border:`1px solid ${P.border}`,padding:"3px 9px" }}>刪除</button>
              <span style={{ fontSize:13,color:P.muted,marginLeft:2 }}>{expandedMain===cat.id?"▲":"▼"}</span>
            </div>
          )}

          {expandedMain===cat.id && (
            <div style={{ borderTop:`1px solid ${P.border}`,background:"#fafaf8" }}>
              {cat.sub.map(sub=>(
                <div key={sub.id}>
                  {editSub?.mainId===cat.id && editSub?.subId===sub.id ? (
                    <div style={{ padding:"10px 14px 10px 50px" }}>
                      <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:7 }}>
                        <div style={{ width:36,height:36,borderRadius:9,background:P.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,overflow:"hidden",flexShrink:0,cursor:"pointer" }}
                          onClick={()=>subImgRef.current?.click()}>
                          {draftSub.img?<img src={draftSub.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />:(draftSub.icon||"✦")}
                        </div>
                        <input value={draftSub.label} onChange={e=>setDraftSub(d=>({...d,label:e.target.value}))} placeholder="小分類名稱" style={{ ...inputSt,flex:1 }} />
                      </div>
                      <div style={{ display:"flex",gap:8,marginBottom:7 }}>
                        <input value={draftSub.icon} onChange={e=>setDraftSub(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{ ...inputSt,flex:1,fontSize:15 }} />
                        <button onClick={()=>subImgRef.current?.click()} style={btnSt(P.warmLight,P.warm)}>上傳圖片</button>
                        <input ref={subImgRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ const f=e.target.files?.[0]; if(f) imgReader(f,d=>setDraftSub(ds=>({...ds,img:d,icon:""}))); }} />
                      </div>
                      <div style={{ display:"flex",gap:8 }}>
                        <button onClick={saveSub}              style={{ ...btnSt(P.accent,"#fff"),flex:1 }}>儲存</button>
                        <button onClick={()=>setEditSub(null)} style={{ ...btnSt(P.border,P.muted),flex:1 }}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding:"9px 14px 9px 50px",display:"flex",alignItems:"center",gap:9,borderBottom:`1px solid ${P.border}` }}>
                      <CatThumb item={sub} size={14} box={28} />
                      <span style={{ flex:1,fontSize:13,color:P.ink }}>{sub.label}</span>
                      <button onClick={()=>{ setEditSub({mainId:cat.id,subId:sub.id}); setDraftSub({label:sub.label,icon:sub.icon,img:sub.img||null}); }}
                        style={{ ...btnSt("none",P.accent),border:`1px solid ${P.accent}`,padding:"2px 8px",fontSize:11 }}>編輯</button>
                      <button onClick={()=>deleteSub(cat.id,sub.id)}
                        style={{ ...btnSt("none",P.muted),border:`1px solid ${P.border}`,padding:"2px 8px",fontSize:11 }}>刪除</button>
                    </div>
                  )}
                </div>
              ))}

              {editSub?.mainId===cat.id && editSub?.subId==="new" ? (
                <div style={{ padding:"10px 14px 10px 50px" }}>
                  <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:7 }}>
                    <div style={{ width:36,height:36,borderRadius:9,background:P.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,overflow:"hidden",flexShrink:0,cursor:"pointer" }}
                      onClick={()=>subImgRef.current?.click()}>
                      {draftSub.img?<img src={draftSub.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />:(draftSub.icon||"🏷️")}
                    </div>
                    <input value={draftSub.label} onChange={e=>setDraftSub(d=>({...d,label:e.target.value}))} placeholder="新小分類名稱" autoFocus style={{ ...inputSt,flex:1 }} />
                  </div>
                  <div style={{ display:"flex",gap:8,marginBottom:7 }}>
                    <input value={draftSub.icon} onChange={e=>setDraftSub(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{ ...inputSt,flex:1,fontSize:15 }} />
                    <button onClick={()=>subImgRef.current?.click()} style={btnSt(P.warmLight,P.warm)}>上傳圖片</button>
                    <input ref={subImgRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ const f=e.target.files?.[0]; if(f) imgReader(f,d=>setDraftSub(ds=>({...ds,img:d,icon:""}))); }} />
                  </div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button onClick={saveSub}              style={{ ...btnSt(P.accent,"#fff"),flex:1 }}>新增</button>
                    <button onClick={()=>setEditSub(null)} style={{ ...btnSt(P.border,P.muted),flex:1 }}>取消</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>{ setEditSub({mainId:cat.id,subId:"new"}); setDraftSub({label:"",icon:"",img:null}); }}
                  style={{ width:"100%",padding:"9px 14px 9px 50px",background:"none",border:"none",color:P.accent,fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"left",fontFamily:"inherit" }}>
                  ＋ 新增小分類
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {editMain==="new" ? (
        <div style={{ background:P.card,borderRadius:14,padding:"12px 14px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8 }}>
            <div style={{ width:42,height:42,borderRadius:11,background:P.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,overflow:"hidden",flexShrink:0,cursor:"pointer" }}
              onClick={()=>mainImgRef.current?.click()}>
              {draftMain.img?<img src={draftMain.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />:(draftMain.icon||"🏷️")}
            </div>
            <input value={draftMain.label} onChange={e=>setDraftMain(d=>({...d,label:e.target.value}))} placeholder="新大分類名稱" autoFocus style={{ ...inputSt,flex:1 }} />
          </div>
          <div style={{ display:"flex",gap:8,marginBottom:8 }}>
            <input value={draftMain.icon} onChange={e=>setDraftMain(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{ ...inputSt,flex:1,fontSize:16 }} />
            <button onClick={()=>mainImgRef.current?.click()} style={btnSt(P.warmLight,P.warm)}>上傳圖片</button>
            <input ref={mainImgRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ const f=e.target.files?.[0]; if(f) imgReader(f,d=>setDraftMain(dm=>({...dm,img:d,icon:""}))); }} />
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={saveMain}              style={{ ...btnSt(P.accent,"#fff"),flex:1 }}>新增</button>
            <button onClick={()=>setEditMain(null)} style={{ ...btnSt(P.border,P.muted),flex:1 }}>取消</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>{ setEditMain("new"); setDraftMain({label:"",icon:"",img:null}); }}
          style={{ width:"100%",padding:13,background:"none",color:P.accent,border:`1.5px solid ${P.accent}`,borderRadius:14,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
          ＋ 新增大分類
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 主 App
// ══════════════════════════════════════════════════════
export default function App() {
  const [records,    setRecords]    = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [calcIcon,   setCalcIcon]   = useState({ emoji:"🧮", img:null });
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("home");

  const [showForm,  setShowForm]  = useState(false);
  const [showCalc,  setShowCalc]  = useState(false);
  const [showQR,    setShowQR]    = useState(false);

  const [form, setForm] = useState({ date:today(), item:"", note:"", catMain:"", catSub:"", payment:"cash", amount:"" });
  const [formError, setFormError] = useState("");
  const [filterMonth, setFilterMonth] = useState(today().slice(0,7));

  const payMap = Object.fromEntries(PAYMENT_METHODS.map(p=>[p.id,p]));

  // ── Firebase 讀取 ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "records"), snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "categories"), snap => {
      if (snap.docs.length > 0) {
        // 依照固定順序排列
        const loaded = snap.docs.map(d => ({ ...d.data() }));
        setCategories(loaded);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "calcIcon"), snap => {
      if (snap.exists()) setCalcIcon(snap.data());
    });
    return unsub;
  }, []);

  // ── Firebase 寫入分類 ──
  useEffect(() => {
    categories.forEach(cat => {
      setDoc(doc(db, "categories", cat.id), cat);
    });
  }, [categories]);

  // ── Firebase 寫入 calcIcon ──
  useEffect(() => {
    setDoc(doc(db, "settings", "calcIcon"), calcIcon);
  }, [calcIcon]);

  const filtered = records.filter(r=>r.date.startsWith(filterMonth)).sort((a,b)=>b.date.localeCompare(a.date));
  const totalMonth = filtered.reduce((s,r)=>s+r.amount,0);

  function setMainCat(id) { setForm(f=>({...f,catMain:id,catSub:""})); }

  async function submitForm() {
    if(!form.item.trim())  return setFormError("請輸入品項名稱");
    if(!form.catMain)      return setFormError("請選擇分類");
    if(!form.amount||isNaN(form.amount)||+form.amount<=0) return setFormError("請輸入有效金額");
    await addDoc(collection(db, "records"), { ...form, amount: +form.amount });
    setForm({date:today(),item:"",note:"",catMain:"",catSub:"",payment:"cash",amount:""});
    setFormError(""); setShowForm(false);
  }

  function handleQR(data) {
    setShowQR(false);
    setForm({ date:data.date||today(), item:data.items?.[0]?.name||"", note:data.invoiceNo?`發票號碼：${data.invoiceNo}`:"", catMain:"", catSub:"", payment:"card", amount:data.amount?String(data.amount):"" });
    setShowForm(true);
  }

  function exportExcel() {
    const rows = [...records].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
      const main=findMain(categories,r.catMain);
      const sub=findSub(categories,r.catMain,r.catSub);
      return { "日期":r.date,"品項名稱":r.item,"說明":r.note,"大分類":main?.label||"","小分類":sub?.label||"","付款方式":payMap[r.payment]?.label||r.payment,"金額 (NT$)":r.amount };
    });
    const ws=XLSX.utils.json_to_sheet(rows);
    ws["!cols"]=[{wch:12},{wch:20},{wch:26},{wch:10},{wch:10},{wch:10},{wch:12}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"支出記錄");
    XLSX.writeFile(wb,`支出記錄_${today()}.xlsx`);
  }

  const catStats = categories.map(c=>({...c,total:filtered.filter(r=>r.catMain===c.id).reduce((s,r)=>s+r.amount,0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
  const maxStat=catStats[0]?.total||1;
  const payStats=PAYMENT_METHODS.map(p=>({...p,total:filtered.filter(r=>r.payment===p.id).reduce((s,r)=>s+r.amount,0)})).filter(p=>p.total>0);

  const inputSt = { width:"100%",padding:"11px 13px",borderRadius:11,border:`1.5px solid ${P.border}`,fontSize:14,color:P.ink,outline:"none",background:P.bg,boxSizing:"border-box",fontFamily:"inherit" };
  const labelSt = { fontSize:11,fontWeight:700,color:P.muted,marginBottom:5,letterSpacing:0.8,display:"block" };
  const chipSt  = (active,color) => ({ padding:"7px 12px",borderRadius:10,border:`1.5px solid ${active?color:P.border}`,background:active?color+"18":"#fff",color:active?color:P.muted,fontSize:13,fontWeight:active?700:500,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5 });
  const cardSt  = { background:P.card,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)" };

  const selectedMain = findMain(categories, form.catMain);
  const monthOpts = [...new Set([filterMonth,...records.map(r=>r.date.slice(0,7))])].sort((a,b)=>b.localeCompare(a));

  if (loading) return (
    <div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:P.bg,fontFamily:"'Noto Serif TC',serif",color:P.muted,fontSize:16 }}>
      🌿 載入中…
    </div>
  );

  return (
    <div style={{ fontFamily:"'Noto Serif TC','Noto Sans TC',serif",background:P.bg,minHeight:"100vh",display:"flex",justifyContent:"center",padding:"0 0 48px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />

      <div style={{ width:"100%",maxWidth:420 }}>

        {/* ══ HEADER ══ */}
        <div style={{ background:P.card,borderBottom:`1px solid ${P.border}`,padding:"18px 18px 0" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
            <div>
              <div style={{ fontSize:18,fontWeight:700,color:P.ink,letterSpacing:-0.3 }}>Toby and Yvette</div>
              <div style={{ fontSize:12,color:P.muted,letterSpacing:0.3 }}>的記帳本 🌿</div>
            </div>
            <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}
              style={{ fontSize:12,color:P.muted,border:`1px solid ${P.border}`,borderRadius:8,padding:"5px 8px",background:P.bg,cursor:"pointer",fontFamily:"inherit" }}>
              {monthOpts.map(m=><option key={m} value={m}>{m.replace("-","年")}月</option>)}
            </select>
          </div>

          <div style={{ display:"flex",gap:8,marginBottom:14 }}>
            <button onClick={()=>setShowForm(true)}
              style={{ flex:2,padding:"11px 0",background:P.accent,color:"#fff",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:0.5,fontFamily:"inherit",boxShadow:`0 3px 10px ${P.accent}44` }}>
              ＋ 新增支出
            </button>
            <button onClick={()=>setShowQR(true)}
              style={{ flex:1,padding:"11px 0",background:P.warmLight,color:P.warm,border:`1.5px solid ${P.warm}55`,borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
              📷 掃描發票
            </button>
          </div>

          <div style={{ display:"flex",borderTop:`1px solid ${P.border}` }}>
            {[["home","明細"],["stats","統計"],["settings","設定"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{ flex:1,padding:"11px 0",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:tab===k?700:500,color:tab===k?P.accent:P.muted,borderBottom:tab===k?`2px solid ${P.accent}`:"2px solid transparent",transition:"all 0.15s",fontFamily:"inherit" }}>{l}</button>
            ))}
          </div>
        </div>

        {/* ══ CONTENT ══ */}
        <div style={{ padding:16 }}>

          {/* 明細 */}
          {tab==="home" && (
            <>
              {filtered.length===0 && <div style={{ textAlign:"center",color:P.muted,padding:"48px 0",fontSize:14 }}><div style={{ fontSize:32,marginBottom:10 }}>🌿</div>這個月還沒有記錄</div>}
              {filtered.map(r=>{
                const main=findMain(categories,r.catMain)||{icon:"✦",label:"",img:null};
                const sub=findSub(categories,r.catMain,r.catSub);
                const pay=payMap[r.payment]||PAYMENT_METHODS[0];
                return (
                  <div key={r.id} style={cardSt}>
                    <div style={{ display:"flex",alignItems:"flex-start",gap:12 }}>
                      <CatThumb item={sub||main} />
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:14,fontWeight:600,color:P.ink }}>{r.item}</div>
                        {r.note&&<div style={{ fontSize:12,color:P.muted,marginTop:2 }}>{r.note}</div>}
                        <div style={{ fontSize:11,color:P.muted,marginTop:4,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center" }}>
                          <Tag>{main.label}{sub?` › ${sub.label}`:""}</Tag>
                          <Tag color={P.warm} bg={P.warmLight}>{pay.icon} {pay.label}</Tag>
                          <span>{r.date}</span>
                        </div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4 }}>
                        <div style={{ fontSize:17,fontWeight:700,color:P.ink }}>{fmt(r.amount)}</div>
                        <button onClick={()=>deleteDoc(doc(db,"records",r.id))} style={{ fontSize:10,color:P.border,background:"none",border:"none",cursor:"pointer",padding:0 }}>刪除</button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div style={{ ...cardSt,display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:16 }}>
                <div>
                  <div style={{ fontSize:11,color:P.muted,fontWeight:600,letterSpacing:0.8,marginBottom:3 }}>本月支出總計</div>
                  <div style={{ fontSize:22,fontWeight:700,color:P.accent,letterSpacing:-0.5 }}>{fmt(totalMonth)}</div>
                  <div style={{ fontSize:11,color:P.muted,marginTop:2 }}>{filtered.length} 筆</div>
                </div>
                <button onClick={exportExcel}
                  style={{ padding:"11px 18px",background:"none",color:P.accent,border:`1.5px solid ${P.accent}`,borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                  ↓ 匯出 Excel
                </button>
              </div>
            </>
          )}

          {/* 統計 */}
          {tab==="stats" && (
            <>
              <div style={{ fontSize:13,fontWeight:700,color:P.ink,marginBottom:12 }}>分類支出</div>
              {catStats.length===0&&<div style={{ color:P.muted,fontSize:13,textAlign:"center",padding:"32px 0" }}>本月尚無支出</div>}
              {catStats.map(c=>(
                <div key={c.id} style={{ ...cardSt,padding:"12px 16px" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:7,alignItems:"center" }}>
                    <div style={{ display:"flex",gap:8,alignItems:"center" }}><CatThumb item={c} size={16} box={30} /><span style={{ fontSize:13,fontWeight:600,color:P.ink }}>{c.label}</span></div>
                    <span style={{ fontSize:14,fontWeight:700,color:P.accent }}>{fmt(c.total)}</span>
                  </div>
                  <div style={{ height:6,background:P.border,borderRadius:6,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${(c.total/maxStat)*100}%`,background:P.accent,borderRadius:6,transition:"width 0.4s ease" }} />
                  </div>
                  <div style={{ fontSize:11,color:P.muted,marginTop:5 }}>佔本月 {Math.round((c.total/totalMonth||0)*100)}%</div>
                </div>
              ))}
              <div style={{ fontSize:13,fontWeight:700,color:P.ink,margin:"20px 0 12px" }}>付款方式</div>
              <div style={{ display:"flex",gap:8 }}>
                {payStats.map(p=>(
                  <div key={p.id} style={{ ...cardSt,flex:1,textAlign:"center",padding:"14px 8px" }}>
                    <div style={{ fontSize:22,marginBottom:5 }}>{p.icon}</div>
                    <div style={{ fontSize:12,color:P.muted,marginBottom:4 }}>{p.label}</div>
                    <div style={{ fontSize:15,fontWeight:700,color:P.ink }}>{fmt(p.total)}</div>
                  </div>
                ))}
                {payStats.length===0&&<div style={{ color:P.muted,fontSize:13 }}>本月尚無資料</div>}
              </div>
            </>
          )}

          {/* 設定 */}
          {tab==="settings" && (
            <SettingsTab categories={categories} setCategories={setCategories} calcIcon={calcIcon} setCalcIcon={setCalcIcon} />
          )}
        </div>
      </div>

      {/* ══ 新增支出 Modal ══ */}
      {showForm && (
        <div style={{ position:"fixed",inset:0,background:"rgba(44,44,44,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:999,backdropFilter:"blur(3px)" }}
          onClick={e=>{ if(e.target===e.currentTarget){ setShowForm(false); setFormError(""); } }}>
          <div style={{ background:P.card,borderRadius:"24px 24px 0 0",padding:"22px 18px 32px",width:"100%",maxWidth:420,maxHeight:"92vh",overflowY:"auto" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
              <div style={{ fontSize:17,fontWeight:700,color:P.ink }}>新增支出</div>
              <button onClick={()=>{ setShowForm(false); setFormError(""); }} style={{ background:P.bg,border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",color:P.muted,fontSize:15 }}>✕</button>
            </div>

            <div style={{ marginBottom:13 }}>
              <label style={labelSt}>日期</label>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inputSt} />
            </div>
            <div style={{ marginBottom:13 }}>
              <label style={labelSt}>品項名稱 *</label>
              <input type="text" placeholder="例：拿鐵咖啡" value={form.item} onChange={e=>setForm(f=>({...f,item:e.target.value}))} style={inputSt} />
            </div>
            <div style={{ marginBottom:13 }}>
              <label style={labelSt}>說明（選填）</label>
              <input type="text" placeholder="備注這筆花費…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={inputSt} />
            </div>

            <div style={{ marginBottom:13 }}>
              <label style={labelSt}>金額（NT$）*</label>
              <div style={{ display:"flex",gap:8 }}>
                <input type="number" placeholder="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                  style={{ ...inputSt,flex:1,fontSize:20,fontWeight:700,textAlign:"right" }} />
                <button onClick={()=>setShowCalc(true)}
                  style={{ padding:"0 13px",background:P.accentLight,color:P.accent,border:`1.5px solid ${P.accent}44`,borderRadius:11,cursor:"pointer",fontSize:22,flexShrink:0,width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden" }}>
                  {calcIcon.img
                    ? <img src={calcIcon.img} alt="" style={{ width:32,height:32,objectFit:"cover",borderRadius:6 }} />
                    : <span>{calcIcon.emoji||"🧮"}</span>}
                </button>
              </div>
            </div>

            <div style={{ marginBottom:13 }}>
              <label style={labelSt}>分類 *</label>
              <div style={{ display:"flex",flexWrap:"wrap",gap:7,marginBottom:8 }}>
                {categories.map(c=>(
                  <button key={c.id} onClick={()=>setMainCat(c.id)} style={chipSt(form.catMain===c.id,P.accent)}>
                    <span style={{ width:18,height:18,borderRadius:5,overflow:"hidden",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:13,background:P.accentLight,flexShrink:0 }}>
                      {c.img?<img src={c.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />:c.icon}
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
              {selectedMain && selectedMain.sub.length > 0 && (
                <div style={{ display:"flex",flexWrap:"wrap",gap:6,paddingLeft:4,borderLeft:`3px solid ${P.accentLight}`,marginLeft:2 }}>
                  {selectedMain.sub.map(s=>(
                    <button key={s.id} onClick={()=>setForm(f=>({...f,catSub:s.id}))} style={{ ...chipSt(form.catSub===s.id,P.warm),fontSize:12,padding:"5px 10px" }}>
                      <span style={{ width:15,height:15,borderRadius:4,overflow:"hidden",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,background:P.warmLight,flexShrink:0 }}>
                        {s.img?<img src={s.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />:s.icon}
                      </span>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={labelSt}>付款方式</label>
              <div style={{ display:"flex",gap:8 }}>
                {PAYMENT_METHODS.map(p=>(
                  <button key={p.id} onClick={()=>setForm(f=>({...f,payment:p.id}))} style={{ ...chipSt(form.payment===p.id,P.warm),flex:1,justifyContent:"center" }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            {formError&&<div style={{ fontSize:12,color:P.danger,marginBottom:10,textAlign:"center" }}>{formError}</div>}

            <button onClick={submitForm} style={{ width:"100%",padding:15,background:P.accent,color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"inherit" }}>
              儲存記錄
            </button>
          </div>
        </div>
      )}

      {showCalc && <Calculator initial={form.amount} calcIcon={calcIcon} onConfirm={v=>{ setForm(f=>({...f,amount:String(v)})); setShowCalc(false); }} onClose={()=>setShowCalc(false)} />}
      {showQR   && <QRScanner onResult={handleQR} onClose={()=>setShowQR(false)} />}
    </div>
  );
}

