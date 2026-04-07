import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot,
  addDoc, deleteDoc, setDoc, getDoc
} from "firebase/firestore";

// ── 預設分類 ─────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "food", label: "餐飲", icon: "🍜", img: null, sub: [
    { id: "food-eat",   label: "外食", icon: "🍱", img: null },
    { id: "food-cafe",  label: "咖啡", icon: "☕",  img: null },
    { id: "food-drink", label: "飲料", icon: "🧋", img: null },
    { id: "food-cook",  label: "食材", icon: "🥦", img: null },
  ]},
  { id: "transport", label: "交通", icon: "🚇", img: null, sub: [
    { id: "tp-mrt",  label: "捷運/公車", icon: "🚌", img: null },
    { id: "tp-taxi", label: "計程車",    icon: "🚕", img: null },
    { id: "tp-gas",  label: "加油",      icon: "⛽", img: null },
  ]},
  { id: "entertainment", label: "娛樂", icon: "🎬", img: null, sub: [
    { id: "en-movie",  label: "電影", icon: "🎞️", img: null },
    { id: "en-game",   label: "遊戲", icon: "🎮", img: null },
    { id: "en-travel", label: "旅遊", icon: "✈️", img: null },
  ]},
  { id: "shopping", label: "購物", icon: "🛍️", img: null, sub: [
    { id: "sh-cloth",  label: "衣物",   icon: "👗", img: null },
    { id: "sh-beauty", label: "保養",   icon: "🧴", img: null },
    { id: "sh-home",   label: "家用品", icon: "🪣", img: null },
  ]},
  { id: "health", label: "醫療", icon: "💊", img: null, sub: [
    { id: "he-clinic",  label: "門診", icon: "🏥", img: null },
    { id: "he-pharma",  label: "藥品", icon: "💉", img: null },
    { id: "he-fitness", label: "健身", icon: "🏋️", img: null },
  ]},
  { id: "home", label: "居家", icon: "🏠", img: null, sub: [
    { id: "ho-rent",   label: "房租", icon: "🔑", img: null },
    { id: "ho-util",   label: "水電", icon: "💡", img: null },
    { id: "ho-repair", label: "維修", icon: "🔧", img: null },
  ]},
  { id: "education", label: "學習", icon: "📚", img: null, sub: [
    { id: "ed-book",   label: "書籍", icon: "📖", img: null },
    { id: "ed-course", label: "課程", icon: "🎓", img: null },
  ]},
  { id: "other", label: "其他", icon: "✦", img: null, sub: [
    { id: "ot-gift", label: "禮物", icon: "🎁", img: null },
    { id: "ot-misc", label: "雜項", icon: "📌", img: null },
  ]},
];

const PAYMENT_METHODS = [
  { id: "cash",     label: "現金",   icon: "💵" },
  { id: "card",     label: "信用卡", icon: "💳" },
  { id: "transfer", label: "轉帳",   icon: "🏦" },
];

// 固定主題色
const T = {
  bg: "#F7F4EF", headerBg: "#FFFFFF", card: "#FFFFFF",
  accent: "#7C9E87", accentLight: "#EBF3EE",
  warm: "#C8956C", warmLight: "#FAF0E8",
  border: "#E8E2D9", ink: "#4A4035", muted: "#9A9080",
  tagBg: "#EBF3EE", tagText: "#7C9E87",
  danger: "#e07070",
};

function today() { return new Date().toISOString().slice(0, 10); }
function fmt(n)  { return "NT$ " + Number(n).toLocaleString(); }
function uid()   { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function findMain(cats, id) { return cats.find(c => c.id === id); }
function findSub(cats, mainId, subId) { return findMain(cats, mainId)?.sub?.find(s => s.id === subId); }
function imgReader(file, cb) { const r = new FileReader(); r.onload = e => cb(e.target.result); r.readAsDataURL(file); }

// 把圖片壓小，避免超過 Firebase 1MB 限制
function compressImage(dataUrl, maxWidth = 400, quality = 0.7) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

function CatThumb({ item, size = 20, box = 36 }) {
  return (
    <div style={{ width:box, height:box, borderRadius:box*0.28, background:T.accentLight, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size, flexShrink:0, overflow:"hidden" }}>
      {item?.img ? <img src={item.img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : (item?.icon || "✦")}
    </div>
  );
}

function Tag({ children, color, bg }) {
  return <span style={{ fontSize:11, fontWeight:600, color, background:bg, borderRadius:6, padding:"2px 8px" }}>{children}</span>;
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
  const OP   = { "÷":"/","×":"*","−":"-","%":"/100*" };
  function bc(v) {
    if (v === "=")              return { bg:T.accent,    fg:"#fff" };
    if ("C⌫".includes(v))      return { bg:"#fde8e8",   fg:T.danger };
    if ("÷×−+%".includes(v))   return { bg:T.warmLight, fg:T.warm };
    return { bg:"#f5f3ef", fg:T.ink };
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(44,44,44,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1100,backdropFilter:"blur(3px)" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:T.card,borderRadius:"24px 24px 0 0",padding:"20px 16px 32px",width:"100%",maxWidth:420 }}>
        <div style={{ background:T.bg,borderRadius:14,padding:"14px 18px",marginBottom:14,minHeight:60,display:"flex",flexDirection:"column",alignItems:"flex-end" }}>
          <div style={{ fontSize:13,color:T.muted,minHeight:18,wordBreak:"break-all" }}>{expr||" "}</div>
          <div style={{ fontSize:32,fontWeight:700,color:T.ink,letterSpacing:-1 }}>{disp}</div>
        </div>
        {ROWS.map((row,ri)=>(
          <div key={ri} style={{ display:"flex",gap:8,marginBottom:8 }}>
            {row.map(v => {
              if (v === " ") return <div key={v} style={{ flex:1 }} />;
              const { bg, fg } = bc(v);
              return <button key={v} onClick={()=>press(OP[v]||v)} style={{ flex:1,padding:"15px 0",borderRadius:12,border:"none",background:bg,color:fg,fontSize:18,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>{v}</button>;
            })}
          </div>
        ))}
        <button onClick={()=>{ const n=parseFloat(disp); if(!isNaN(n)&&n>0) onConfirm(n); else onClose(); }}
          style={{ width:"100%",padding:14,background:T.accent,color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:4,letterSpacing:1,fontFamily:"inherit" }}>
          確認金額
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 設定頁（計算機 + 分類）
// ══════════════════════════════════════════════════════
function SettingsTab({ categories, onSaveCategories, calcIcon, setCalcIcon }) {
  const [section,      setSection]      = useState("calc");
  const [localCats,    setLocalCats]    = useState(categories);
  const [expandedMain, setExpandedMain] = useState(null);
  const [editMain,     setEditMain]     = useState(null);
  const [editSub,      setEditSub]      = useState(null);
  const [draftMain,    setDraftMain]    = useState({ label:"", icon:"", img:null });
  const [draftSub,     setDraftSub]     = useState({ label:"", icon:"", img:null });
  const [saveStatus,   setSaveStatus]   = useState(""); // "", "saving", "saved", "error"
  const mainImgRef = useRef(null);
  const subImgRef  = useRef(null);
  const calcImgRef = useRef(null);

  // 當外部 categories 更新時同步（只在初次或外部變更時）
  useEffect(() => { setLocalCats(categories); }, [categories]);

  async function handleSaveCategories() {
    setSaveStatus("saving");
    try {
      await onSaveCategories(localCats);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(""), 3000);
    }
  }

  function saveMain() {
    if (!draftMain.label.trim()) return;
    if (editMain === "new") {
      setLocalCats(p => [...p, { id:uid(), label:draftMain.label.trim(), icon:draftMain.icon||"✦", img:draftMain.img, sub:[] }]);
    } else {
      setLocalCats(p => p.map(c => c.id===editMain ? {...c,...draftMain} : c));
    }
    setEditMain(null);
  }

  function saveSub() {
    if (!draftSub.label.trim()) return;
    setLocalCats(p => p.map(c => {
      if (c.id !== editSub.mainId) return c;
      if (editSub.subId === "new") return { ...c, sub:[...c.sub, {id:uid(), label:draftSub.label.trim(), icon:draftSub.icon||"✦", img:draftSub.img}] };
      return { ...c, sub: c.sub.map(s => s.id===editSub.subId ? {...s,...draftSub} : s) };
    }));
    setEditSub(null);
  }

  async function handleImgUpload(file, cb) {
    const raw = await new Promise(res => imgReader(file, res));
    const compressed = await compressImage(raw);
    cb(compressed);
  }

  const iSt = { width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,outline:"none",background:T.bg,boxSizing:"border-box",fontFamily:"inherit" };
  const bSt = (bg, cl) => ({ padding:"7px 12px",borderRadius:9,border:"none",background:bg,color:cl,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0 });

  return (
    <div>
      {/* 區塊切換 */}
      <div style={{ display:"flex",gap:8,marginBottom:16 }}>
        {[["calc","🧮 計算機"],["cats","📂 分類"]].map(([k,l]) => (
          <button key={k} onClick={()=>setSection(k)}
            style={{ flex:1,padding:"10px 0",borderRadius:11,border:`1.5px solid ${section===k?T.accent:T.border}`,background:section===k?T.accent+"18":"#fff",color:section===k?T.accent:T.muted,fontSize:13,fontWeight:section===k?700:500,cursor:"pointer",fontFamily:"inherit" }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── 計算機圖示 ── */}
      {section === "calc" && (
        <div>
          <div style={{ fontSize:13,fontWeight:700,color:T.ink,marginBottom:10 }}>計算機按鈕圖示</div>
          <div style={{ background:T.card,borderRadius:14,padding:"14px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",gap:12 }}>
            <div style={{ width:52,height:52,borderRadius:13,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,overflow:"hidden",cursor:"pointer",flexShrink:0 }}
              onClick={()=>calcImgRef.current?.click()}>
              {calcIcon?.img ? <img src={calcIcon.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : <span>{calcIcon?.emoji||"🧮"}</span>}
            </div>
            <div style={{ flex:1 }}>
              <input value={calcIcon?.emoji||""} onChange={e=>setCalcIcon(ci=>({...ci,emoji:e.target.value,img:null}))}
                placeholder="輸入 Emoji 圖示" style={{ ...iSt,marginBottom:8 }} />
              <button onClick={()=>calcImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>📁 上傳自訂圖片</button>
              <input ref={calcImgRef} type="file" accept="image/*" style={{ display:"none" }}
                onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImgUpload(f, d=>setCalcIcon({emoji:"",img:d})); }} />
            </div>
          </div>
        </div>
      )}

      {/* ── 分類管理 ── */}
      {section === "cats" && (
        <div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
            <div style={{ fontSize:13,fontWeight:700,color:T.ink }}>管理分類</div>
            <button onClick={handleSaveCategories}
              style={{ padding:"8px 18px",background:saveStatus==="saved"?"#6ab187":saveStatus==="error"?T.danger:T.accent,color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"background 0.2s" }}>
              {saveStatus==="saving" ? "儲存中…" : saveStatus==="saved" ? "✓ 已儲存" : saveStatus==="error" ? "失敗，重試" : "儲存分類"}
            </button>
          </div>

          <div style={{ fontSize:11,color:T.muted,marginBottom:12,background:T.warmLight,borderRadius:10,padding:"8px 12px" }}>
            💡 修改完畢後請按「儲存分類」，才會永久保存
          </div>

          {localCats.map(cat => (
            <div key={cat.id} style={{ background:T.card,borderRadius:14,marginBottom:10,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              {editMain === cat.id ? (
                <div style={{ padding:"12px 14px" }}>
                  <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8 }}>
                    <div style={{ width:42,height:42,borderRadius:11,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,overflow:"hidden",flexShrink:0,cursor:"pointer" }}
                      onClick={()=>mainImgRef.current?.click()}>
                      {draftMain.img ? <img src={draftMain.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : (draftMain.icon||"✦")}
                    </div>
                    <input value={draftMain.label} onChange={e=>setDraftMain(d=>({...d,label:e.target.value}))} placeholder="大分類名稱" style={{ ...iSt,flex:1 }} />
                  </div>
                  <div style={{ display:"flex",gap:8,marginBottom:8 }}>
                    <input value={draftMain.icon} onChange={e=>setDraftMain(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{ ...iSt,flex:1,fontSize:16 }} />
                    <button onClick={()=>mainImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>上傳圖片</button>
                    <input ref={mainImgRef} type="file" accept="image/*" style={{ display:"none" }}
                      onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImgUpload(f, d=>setDraftMain(dm=>({...dm,img:d,icon:""}))); }} />
                  </div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button onClick={saveMain}              style={{ ...bSt(T.accent,"#fff"),flex:1 }}>確認</button>
                    <button onClick={()=>setEditMain(null)} style={{ ...bSt(T.border,T.muted),flex:1 }}>取消</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding:"11px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer" }}
                  onClick={()=>setExpandedMain(v => v===cat.id ? null : cat.id)}>
                  <CatThumb item={cat} size={18} box={34} />
                  <span style={{ flex:1,fontSize:14,fontWeight:600,color:T.ink }}>{cat.label}</span>
                  <span style={{ fontSize:11,color:T.muted,marginRight:4 }}>{cat.sub.length} 小類</span>
                  <button onClick={e=>{ e.stopPropagation(); setEditMain(cat.id); setDraftMain({label:cat.label,icon:cat.icon,img:cat.img||null}); }}
                    style={{ ...bSt("none",T.accent),border:`1px solid ${T.accent}`,padding:"3px 9px" }}>編輯</button>
                  <button onClick={e=>{ e.stopPropagation(); setLocalCats(p=>p.filter(c=>c.id!==cat.id)); }}
                    style={{ ...bSt("none",T.muted),border:`1px solid ${T.border}`,padding:"3px 9px" }}>刪除</button>
                  <span style={{ fontSize:12,color:T.muted }}>{expandedMain===cat.id?"▲":"▼"}</span>
                </div>
              )}

              {expandedMain === cat.id && (
                <div style={{ borderTop:`1px solid ${T.border}`,background:"#fafaf8" }}>
                  {cat.sub.map(sub => (
                    <div key={sub.id}>
                      {editSub?.mainId===cat.id && editSub?.subId===sub.id ? (
                        <div style={{ padding:"10px 14px 10px 50px" }}>
                          <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:7 }}>
                            <div style={{ width:36,height:36,borderRadius:9,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,overflow:"hidden",flexShrink:0,cursor:"pointer" }}
                              onClick={()=>subImgRef.current?.click()}>
                              {draftSub.img ? <img src={draftSub.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : (draftSub.icon||"✦")}
                            </div>
                            <input value={draftSub.label} onChange={e=>setDraftSub(d=>({...d,label:e.target.value}))} placeholder="小分類名稱" style={{ ...iSt,flex:1 }} />
                          </div>
                          <div style={{ display:"flex",gap:8,marginBottom:7 }}>
                            <input value={draftSub.icon} onChange={e=>setDraftSub(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{ ...iSt,flex:1,fontSize:15 }} />
                            <button onClick={()=>subImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>上傳圖片</button>
                            <input ref={subImgRef} type="file" accept="image/*" style={{ display:"none" }}
                              onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImgUpload(f, d=>setDraftSub(ds=>({...ds,img:d,icon:""}))); }} />
                          </div>
                          <div style={{ display:"flex",gap:8 }}>
                            <button onClick={saveSub}              style={{ ...bSt(T.accent,"#fff"),flex:1 }}>確認</button>
                            <button onClick={()=>setEditSub(null)} style={{ ...bSt(T.border,T.muted),flex:1 }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding:"9px 14px 9px 50px",display:"flex",alignItems:"center",gap:9,borderBottom:`1px solid ${T.border}` }}>
                          <CatThumb item={sub} size={14} box={28} />
                          <span style={{ flex:1,fontSize:13,color:T.ink }}>{sub.label}</span>
                          <button onClick={()=>{ setEditSub({mainId:cat.id,subId:sub.id}); setDraftSub({label:sub.label,icon:sub.icon,img:sub.img||null}); }}
                            style={{ ...bSt("none",T.accent),border:`1px solid ${T.accent}`,padding:"2px 8px",fontSize:11 }}>編輯</button>
                          <button onClick={()=>setLocalCats(p=>p.map(c=>c.id===cat.id?{...c,sub:c.sub.filter(s=>s.id!==sub.id)}:c))}
                            style={{ ...bSt("none",T.muted),border:`1px solid ${T.border}`,padding:"2px 8px",fontSize:11 }}>刪除</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {editSub?.mainId===cat.id && editSub?.subId==="new" ? (
                    <div style={{ padding:"10px 14px 10px 50px" }}>
                      <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:7 }}>
                        <div style={{ width:36,height:36,borderRadius:9,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,overflow:"hidden",flexShrink:0,cursor:"pointer" }}
                          onClick={()=>subImgRef.current?.click()}>
                          {draftSub.img ? <img src={draftSub.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : "🏷️"}
                        </div>
                        <input value={draftSub.label} onChange={e=>setDraftSub(d=>({...d,label:e.target.value}))} placeholder="新小分類名稱" autoFocus style={{ ...iSt,flex:1 }} />
                      </div>
                      <div style={{ display:"flex",gap:8,marginBottom:7 }}>
                        <input value={draftSub.icon} onChange={e=>setDraftSub(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{ ...iSt,flex:1,fontSize:15 }} />
                        <button onClick={()=>subImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>上傳圖片</button>
                        <input ref={subImgRef} type="file" accept="image/*" style={{ display:"none" }}
                          onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImgUpload(f, d=>setDraftSub(ds=>({...ds,img:d,icon:""}))); }} />
                      </div>
                      <div style={{ display:"flex",gap:8 }}>
                        <button onClick={saveSub}              style={{ ...bSt(T.accent,"#fff"),flex:1 }}>新增</button>
                        <button onClick={()=>setEditSub(null)} style={{ ...bSt(T.border,T.muted),flex:1 }}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={()=>{ setEditSub({mainId:cat.id,subId:"new"}); setDraftSub({label:"",icon:"",img:null}); }}
                      style={{ width:"100%",padding:"9px 14px 9px 50px",background:"none",border:"none",color:T.accent,fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"left",fontFamily:"inherit" }}>
                      ＋ 新增小分類
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {editMain === "new" ? (
            <div style={{ background:T.card,borderRadius:14,padding:"12px 14px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8 }}>
                <div style={{ width:42,height:42,borderRadius:11,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,overflow:"hidden",flexShrink:0,cursor:"pointer" }}
                  onClick={()=>mainImgRef.current?.click()}>
                  {draftMain.img ? <img src={draftMain.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : (draftMain.icon||"🏷️")}
                </div>
                <input value={draftMain.label} onChange={e=>setDraftMain(d=>({...d,label:e.target.value}))} placeholder="新大分類名稱" autoFocus style={{ ...iSt,flex:1 }} />
              </div>
              <div style={{ display:"flex",gap:8,marginBottom:8 }}>
                <input value={draftMain.icon} onChange={e=>setDraftMain(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{ ...iSt,flex:1,fontSize:16 }} />
                <button onClick={()=>mainImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>上傳圖片</button>
                <input ref={mainImgRef} type="file" accept="image/*" style={{ display:"none" }}
                  onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImgUpload(f, d=>setDraftMain(dm=>({...dm,img:d,icon:""}))); }} />
              </div>
              <div style={{ display:"flex",gap:8 }}>
                <button onClick={saveMain}              style={{ ...bSt(T.accent,"#fff"),flex:1 }}>新增</button>
                <button onClick={()=>setEditMain(null)} style={{ ...bSt(T.border,T.muted),flex:1 }}>取消</button>
              </div>
            </div>
          ) : (
            <button onClick={()=>{ setEditMain("new"); setDraftMain({label:"",icon:"",img:null}); }}
              style={{ width:"100%",padding:13,background:"none",color:T.accent,border:`1.5px solid ${T.accent}`,borderRadius:14,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4 }}>
              ＋ 新增大分類
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 主 App
// ══════════════════════════════════════════════════════
export default function App() {
  const [records,     setRecords]     = useState([]);
  const [categories,  setCategories]  = useState(DEFAULT_CATEGORIES);
  const [calcIcon,    setCalcIcon]    = useState({ emoji:"🧮", img:null });
  const [footerImg,   setFooterImg]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState("home");
  const [showForm,    setShowForm]    = useState(false);
  const [showCalc,    setShowCalc]    = useState(false);
  const [form,        setForm]        = useState({ date:today(), item:"", note:"", catMain:"", catSub:"", payment:"cash", amount:"" });
  const [formError,   setFormError]   = useState("");
  const [filterMonth, setFilterMonth] = useState(today().slice(0,7));

  const payMap = Object.fromEntries(PAYMENT_METHODS.map(p => [p.id, p]));

  // ── Firebase 讀取 ──────────────────────────────────
  useEffect(() => {
    const u = onSnapshot(collection(db, "records"), snap => {
      setRecords(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setLoading(false);
    });
    return u;
  }, []);

  useEffect(() => {
    // 分類改為存成單一文件 settings/categories
    const u = onSnapshot(doc(db, "settings", "categories"), snap => {
      if (snap.exists() && snap.data().list?.length > 0) {
        setCategories(snap.data().list);
      }
    });
    return u;
  }, []);

  useEffect(() => {
    const u = onSnapshot(doc(db, "settings", "calcIcon"), snap => {
      if (snap.exists()) setCalcIcon(snap.data());
    });
    return u;
  }, []);

  useEffect(() => {
    const u = onSnapshot(doc(db, "settings", "footerImg"), snap => {
      if (snap.exists()) setFooterImg(snap.data().url || null);
    });
    return u;
  }, []);

  // ── 分類儲存：手動觸發，存成單一文件 ──────────────
  async function saveCategories(cats) {
    await setDoc(doc(db, "settings", "categories"), { list: cats });
    setCategories(cats);
  }

  // ── calcIcon 儲存 ──────────────────────────────────
  useEffect(() => {
    setDoc(doc(db, "settings", "calcIcon"), calcIcon);
  }, [calcIcon]);

  // ── 底部圖片 ───────────────────────────────────────
  async function saveFooterImg(dataUrl) {
    const compressed = await compressImage(dataUrl, 800, 0.8);
    setFooterImg(compressed);
    setDoc(doc(db, "settings", "footerImg"), { url: compressed });
  }
  function removeFooterImg() {
    setFooterImg(null);
    setDoc(doc(db, "settings", "footerImg"), { url: null });
  }

  // ── 計算統計 ───────────────────────────────────────
  const filtered   = records.filter(r => r.date.startsWith(filterMonth)).sort((a,b) => b.date.localeCompare(a.date));
  const totalMonth = filtered.reduce((s, r) => s + r.amount, 0);
  const catStats   = categories.map(c => ({ ...c, total: filtered.filter(r=>r.catMain===c.id).reduce((s,r)=>s+r.amount,0) })).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
  const maxStat    = catStats[0]?.total || 1;
  const payStats   = PAYMENT_METHODS.map(p => ({ ...p, total: filtered.filter(r=>r.payment===p.id).reduce((s,r)=>s+r.amount,0) })).filter(p=>p.total>0);
  const monthOpts  = [...new Set([filterMonth, ...records.map(r=>r.date.slice(0,7))])].sort((a,b) => b.localeCompare(a));
  const selectedMain = findMain(categories, form.catMain);

  function setMainCat(id) { setForm(f => ({ ...f, catMain:id, catSub:"" })); }

  async function submitForm() {
    if (!form.item.trim())  return setFormError("請輸入品項名稱");
    if (!form.catMain)      return setFormError("請選擇分類");
    if (!form.amount || isNaN(form.amount) || +form.amount <= 0) return setFormError("請輸入有效金額");
    await addDoc(collection(db, "records"), { ...form, amount: +form.amount });
    setForm({ date:today(), item:"", note:"", catMain:"", catSub:"", payment:"cash", amount:"" });
    setFormError("");
    setShowForm(false);
  }

  function exportExcel() {
    const rows = [...records].sort((a,b) => b.date.localeCompare(a.date)).map(r => ({
      "日期": r.date, "品項名稱": r.item, "說明": r.note,
      "大分類": findMain(categories, r.catMain)?.label || "",
      "小分類": findSub(categories, r.catMain, r.catSub)?.label || "",
      "付款方式": payMap[r.payment]?.label || r.payment,
      "金額 (NT$)": r.amount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{wch:12},{wch:20},{wch:26},{wch:10},{wch:10},{wch:10},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "支出記錄");
    XLSX.writeFile(wb, `支出記錄_${today()}.xlsx`);
  }

  const inputSt = { width:"100%",padding:"11px 13px",borderRadius:11,border:`1.5px solid ${T.border}`,fontSize:14,color:T.ink,outline:"none",background:T.bg,boxSizing:"border-box",fontFamily:"inherit" };
  const labelSt = { fontSize:11,fontWeight:700,color:T.muted,marginBottom:5,letterSpacing:0.8,display:"block" };
  const chipSt  = (active, color, light) => ({ padding:"7px 12px",borderRadius:10,border:`1.5px solid ${active?color:T.border}`,background:active?light:"#fff",color:active?color:T.muted,fontSize:13,fontWeight:active?700:500,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5 });
  const cardSt  = { background:T.card,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)" };

  if (loading) return (
    <div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:"'Noto Serif TC',serif",color:T.muted,fontSize:16 }}>
      🌿 載入中…
    </div>
  );

  return (
    <div style={{ fontFamily:"'Noto Serif TC','Noto Sans TC',serif",background:T.bg,minHeight:"100vh",display:"flex",justifyContent:"center",padding:"0 0 48px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
      <div style={{ width:"100%",maxWidth:420 }}>

        {/* ── HEADER ── */}
        <div style={{ background:T.headerBg,borderBottom:`1px solid ${T.border}`,padding:"18px 18px 0" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
            <div>
              <div style={{ fontSize:18,fontWeight:700,color:T.ink,letterSpacing:-0.3 }}>Toby and Yvette</div>
              <div style={{ fontSize:12,color:T.muted,letterSpacing:0.3 }}>的記帳本 🌿</div>
            </div>
            <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}
              style={{ fontSize:12,color:T.muted,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 8px",background:T.bg,cursor:"pointer",fontFamily:"inherit" }}>
              {monthOpts.map(m => <option key={m} value={m}>{m.replace("-","年")}月</option>)}
            </select>
          </div>
          <div style={{ marginBottom:14 }}>
            <button onClick={()=>setShowForm(true)}
              style={{ width:"100%",padding:"12px 0",background:T.accent,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:0.5,fontFamily:"inherit",boxShadow:`0 3px 10px ${T.accent}44` }}>
              ＋ 新增支出
            </button>
          </div>
          <div style={{ display:"flex",borderTop:`1px solid ${T.border}` }}>
            {[["home","明細"],["stats","統計"],["settings","設定"]].map(([k,l]) => (
              <button key={k} onClick={()=>setTab(k)}
                style={{ flex:1,padding:"11px 0",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:tab===k?700:500,color:tab===k?T.accent:T.muted,borderBottom:tab===k?`2px solid ${T.accent}`:"2px solid transparent",transition:"all 0.15s",fontFamily:"inherit" }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── CONTENT ── */}
        <div style={{ padding:16 }}>

          {/* 明細 */}
          {tab === "home" && (
            <>
              {filtered.length === 0 && (
                <div style={{ textAlign:"center",color:T.muted,padding:"48px 0",fontSize:14 }}>
                  <div style={{ fontSize:32,marginBottom:10 }}>🌿</div>這個月還沒有記錄
                </div>
              )}
              {filtered.map(r => {
                const main = findMain(categories, r.catMain) || { icon:"✦", label:"", img:null };
                const sub  = findSub(categories, r.catMain, r.catSub);
                const pay  = payMap[r.payment] || PAYMENT_METHODS[0];
                return (
                  <div key={r.id} style={cardSt}>
                    <div style={{ display:"flex",alignItems:"flex-start",gap:12 }}>
                      <CatThumb item={sub||main} />
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:14,fontWeight:600,color:T.ink }}>{r.item}</div>
                        {r.note && <div style={{ fontSize:12,color:T.muted,marginTop:2 }}>{r.note}</div>}
                        <div style={{ fontSize:11,color:T.muted,marginTop:4,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center" }}>
                          <Tag color={T.tagText} bg={T.tagBg}>{main.label}{sub?` › ${sub.label}`:""}</Tag>
                          <Tag color={T.warm} bg={T.warmLight}>{pay.icon} {pay.label}</Tag>
                          <span>{r.date}</span>
                        </div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4 }}>
                        <div style={{ fontSize:17,fontWeight:700,color:T.ink }}>{fmt(r.amount)}</div>
                        <button onClick={()=>deleteDoc(doc(db,"records",r.id))} style={{ fontSize:10,color:T.border,background:"none",border:"none",cursor:"pointer",padding:0 }}>刪除</button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 總計 + 匯出 */}
              <div style={{ ...cardSt,display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4 }}>
                <div>
                  <div style={{ fontSize:11,color:T.muted,fontWeight:600,letterSpacing:0.8,marginBottom:3 }}>本月支出總計</div>
                  <div style={{ fontSize:22,fontWeight:700,color:T.accent,letterSpacing:-0.5 }}>{fmt(totalMonth)}</div>
                  <div style={{ fontSize:11,color:T.muted,marginTop:2 }}>{filtered.length} 筆</div>
                </div>
                <button onClick={exportExcel}
                  style={{ padding:"11px 18px",background:"none",color:T.accent,border:`1.5px solid ${T.accent}`,borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                  ↓ 匯出 Excel
                </button>
              </div>

              {/* 底部圖片 */}
              <div style={{ marginTop:8,borderRadius:16,overflow:"hidden" }}>
                {footerImg ? (
                  <div style={{ position:"relative" }}>
                    <img src={footerImg} alt="首頁圖片" style={{ width:"100%",display:"block",borderRadius:16,maxHeight:300,objectFit:"cover" }} />
                    <button onClick={removeFooterImg}
                      style={{ position:"absolute",top:10,right:10,background:"rgba(0,0,0,0.45)",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit" }}>
                      移除圖片
                    </button>
                  </div>
                ) : (
                  <label style={{ display:"block",cursor:"pointer" }}>
                    <div style={{ border:`2px dashed ${T.border}`,borderRadius:16,padding:"30px 0",textAlign:"center",color:T.muted,fontSize:13 }}>
                      <div style={{ fontSize:30,marginBottom:8 }}>🖼️</div>
                      點此上傳首頁底部圖片
                    </div>
                    <input type="file" accept="image/*" style={{ display:"none" }}
                      onChange={e=>{ const f=e.target.files?.[0]; if(f) imgReader(f, saveFooterImg); }} />
                  </label>
                )}
              </div>
            </>
          )}

          {/* 統計 */}
          {tab === "stats" && (
            <>
              <div style={{ fontSize:13,fontWeight:700,color:T.ink,marginBottom:12 }}>分類支出</div>
              {catStats.length===0 && <div style={{ color:T.muted,fontSize:13,textAlign:"center",padding:"32px 0" }}>本月尚無支出</div>}
              {catStats.map(c => (
                <div key={c.id} style={{ ...cardSt,padding:"12px 16px" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:7,alignItems:"center" }}>
                    <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                      <CatThumb item={c} size={16} box={30} />
                      <span style={{ fontSize:13,fontWeight:600,color:T.ink }}>{c.label}</span>
                    </div>
                    <span style={{ fontSize:14,fontWeight:700,color:T.accent }}>{fmt(c.total)}</span>
                  </div>
                  <div style={{ height:6,background:T.border,borderRadius:6,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${(c.total/maxStat)*100}%`,background:T.accent,borderRadius:6,transition:"width 0.4s ease" }} />
                  </div>
                  <div style={{ fontSize:11,color:T.muted,marginTop:5 }}>佔本月 {Math.round((c.total/(totalMonth||1))*100)}%</div>
                </div>
              ))}
              <div style={{ fontSize:13,fontWeight:700,color:T.ink,margin:"20px 0 12px" }}>付款方式</div>
              <div style={{ display:"flex",gap:8 }}>
                {payStats.map(p => (
                  <div key={p.id} style={{ ...cardSt,flex:1,textAlign:"center",padding:"14px 8px" }}>
                    <div style={{ fontSize:22,marginBottom:5 }}>{p.icon}</div>
                    <div style={{ fontSize:12,color:T.muted,marginBottom:4 }}>{p.label}</div>
                    <div style={{ fontSize:15,fontWeight:700,color:T.ink }}>{fmt(p.total)}</div>
                  </div>
                ))}
                {payStats.length===0 && <div style={{ color:T.muted,fontSize:13 }}>本月尚無資料</div>}
              </div>
            </>
          )}

          {/* 設定 */}
          {tab === "settings" && (
            <SettingsTab
              categories={categories}
              onSaveCategories={saveCategories}
              calcIcon={calcIcon}
              setCalcIcon={setCalcIcon}
            />
          )}
        </div>
      </div>

      {/* 新增支出 Modal */}
      {showForm && (
        <div style={{ position:"fixed",inset:0,background:"rgba(44,44,44,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:999,backdropFilter:"blur(3px)" }}
          onClick={e=>{ if(e.target===e.currentTarget){ setShowForm(false); setFormError(""); } }}>
          <div style={{ background:T.card,borderRadius:"24px 24px 0 0",padding:"22px 18px 32px",width:"100%",maxWidth:420,maxHeight:"92vh",overflowY:"auto" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
              <div style={{ fontSize:17,fontWeight:700,color:T.ink }}>新增支出</div>
              <button onClick={()=>{ setShowForm(false); setFormError(""); }} style={{ background:T.bg,border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",color:T.muted,fontSize:15 }}>✕</button>
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
                  style={{ padding:0,background:T.accentLight,border:`1.5px solid ${T.accent}44`,borderRadius:11,cursor:"pointer",flexShrink:0,width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",fontSize:24 }}>
                  {calcIcon.img ? <img src={calcIcon.img} alt="" style={{ width:32,height:32,objectFit:"cover",borderRadius:6 }} /> : <span>{calcIcon.emoji||"🧮"}</span>}
                </button>
              </div>
            </div>
            <div style={{ marginBottom:13 }}>
              <label style={labelSt}>分類 *</label>
              <div style={{ display:"flex",flexWrap:"wrap",gap:7,marginBottom:8 }}>
                {categories.map(c => (
                  <button key={c.id} onClick={()=>setMainCat(c.id)} style={chipSt(form.catMain===c.id, T.accent, T.accentLight)}>
                    <span style={{ width:18,height:18,borderRadius:5,overflow:"hidden",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:13,background:T.accentLight,flexShrink:0 }}>
                      {c.img ? <img src={c.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : c.icon}
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
              {selectedMain && selectedMain.sub.length > 0 && (
                <div style={{ display:"flex",flexWrap:"wrap",gap:6,paddingLeft:4,borderLeft:`3px solid ${T.accentLight}`,marginLeft:2 }}>
                  {selectedMain.sub.map(s => (
                    <button key={s.id} onClick={()=>setForm(f=>({...f,catSub:s.id}))} style={{ ...chipSt(form.catSub===s.id, T.warm, T.warmLight),fontSize:12,padding:"5px 10px" }}>
                      <span style={{ width:15,height:15,borderRadius:4,overflow:"hidden",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,background:T.warmLight,flexShrink:0 }}>
                        {s.img ? <img src={s.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : s.icon}
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
                {PAYMENT_METHODS.map(p => (
                  <button key={p.id} onClick={()=>setForm(f=>({...f,payment:p.id}))} style={{ ...chipSt(form.payment===p.id, T.warm, T.warmLight),flex:1,justifyContent:"center" }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            {formError && <div style={{ fontSize:12,color:T.danger,marginBottom:10,textAlign:"center" }}>{formError}</div>}
            <button onClick={submitForm}
              style={{ width:"100%",padding:15,background:T.accent,color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"inherit" }}>
              儲存記錄
            </button>
          </div>
        </div>
      )}

      {showCalc && (
        <Calculator initial={form.amount} calcIcon={calcIcon}
          onConfirm={v=>{ setForm(f=>({...f,amount:String(v)})); setShowCalc(false); }}
          onClose={()=>setShowCalc(false)} />
      )}
    </div>
  );
}
