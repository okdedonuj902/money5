import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot,
  addDoc, deleteDoc, setDoc, updateDoc
} from "firebase/firestore";

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

const T = {
  bg: "#F7F4EF", headerBg: "#FFFFFF", card: "#FFFFFF",
  accent: "#7C9E87", accentLight: "#EBF3EE",
  warm: "#C8956C", warmLight: "#FAF0E8",
  border: "#E8E2D9", ink: "#4A4035", muted: "#9A9080",
  tagBg: "#EBF3EE", tagText: "#7C9E87", danger: "#e07070",
};

function today()    { return new Date().toISOString().slice(0, 10); }
// 安全金額轉換：避免浮點數精度誤差，金額統一用整數分儲存再換算
function toMoney(val) {
  // 先轉字串去除空白，再用 Math.round 避免 0.9999... 問題
  const n = Math.round(parseFloat(String(val).trim()) * 100) / 100;
  return isNaN(n) ? 0 : n;
}
function fmt(n)     { return "NT$ " + Math.round(Number(n)).toLocaleString(); }
function uid()      { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function findMain(cats, id)           { return cats.find(c => c.id === id); }
function findSub(cats, mId, sId)      { return findMain(cats, mId)?.sub?.find(s => s.id === sId); }
function imgReader(file, cb)          { const r = new FileReader(); r.onload = e => cb(e.target.result); r.readAsDataURL(file); }

function compressImage(dataUrl, maxWidth = 400, quality = 0.7) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const c = document.createElement("canvas");
      c.width = img.width * scale; c.height = img.height * scale;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

function CatThumb({ item, size = 20, box = 36 }) {
  return (
    <div style={{ width:box,height:box,borderRadius:box*0.28,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size,flexShrink:0,overflow:"hidden" }}>
      {item?.img ? <img src={item.img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : (item?.icon||"✦")}
    </div>
  );
}
function Tag({ children, color, bg }) {
  return <span style={{ fontSize:11,fontWeight:600,color,background:bg,borderRadius:6,padding:"2px 8px" }}>{children}</span>;
}

// ══════════════════════════════════════════════════════
// 計算機
// ══════════════════════════════════════════════════════
function Calculator({ initial="", calcIcon, onConfirm, onClose }) {
  const [expr, setExpr] = useState(initial ? String(initial) : "");
  const [disp, setDisp] = useState(initial ? String(initial) : "0");
  const ROWS=[["C","⌫","%","÷"],["7","8","9","×"],["4","5","6","−"],["1","2","3","+"],[" ","0",".","="]];
  const OP={"÷":"/","×":"*","−":"-","%":"/100*"};
  function bc(v) {
    if(v==="=")             return {bg:T.accent,   fg:"#fff"};
    if("C⌫".includes(v))   return {bg:"#fde8e8",  fg:T.danger};
    if("÷×−+%".includes(v))return {bg:T.warmLight,fg:T.warm};
    return {bg:"#f5f3ef",fg:T.ink};
  }
  function press(v) {
    if(v==="C"){setExpr("");setDisp("0");return;}
    if(v==="⌫"){const n=expr.slice(0,-1);setExpr(n);setDisp(n||"0");return;}
    if(v==="="){
      try{
        const safe=expr.replace(/[^0-9+\-*/().]/g,"");
        // eslint-disable-next-line no-new-func
        const r=Math.round(Function('"use strict";return('+safe+')')()*100)/100;
        setDisp(String(r));setExpr(String(r));
      }catch{setDisp("錯誤");}
      return;
    }
    const n=expr+v;setExpr(n);setDisp(n);
  }
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(44,44,44,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1200,backdropFilter:"blur(3px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:T.card,borderRadius:"24px 24px 0 0",padding:"20px 16px 32px",width:"100%",maxWidth:420}}>
        <div style={{background:T.bg,borderRadius:14,padding:"14px 18px",marginBottom:14,minHeight:60,display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
          <div style={{fontSize:13,color:T.muted,minHeight:18,wordBreak:"break-all"}}>{expr||" "}</div>
          <div style={{fontSize:32,fontWeight:700,color:T.ink,letterSpacing:-1}}>{disp}</div>
        </div>
        {ROWS.map((row,ri)=>(
          <div key={ri} style={{display:"flex",gap:8,marginBottom:8}}>
            {row.map(v=>{
              if(v===" ")return <div key={v} style={{flex:1}}/>;
              const{bg,fg}=bc(v);
              return <button key={v} onClick={()=>press(OP[v]||v)} style={{flex:1,padding:"15px 0",borderRadius:12,border:"none",background:bg,color:fg,fontSize:18,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{v}</button>;
            })}
          </div>
        ))}
        <button onClick={()=>{const n=parseFloat(disp);if(!isNaN(n)&&n>0)onConfirm(n);else onClose();}}
          style={{width:"100%",padding:14,background:T.accent,color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:4,letterSpacing:1,fontFamily:"inherit"}}>
          確認金額
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 支出表單（新增 & 編輯共用）
// ══════════════════════════════════════════════════════
const DEFAULT_CREDIT_CARDS = ["書宇聯邦","書宇匯豐","書宇玉山","書宇台灣銀行","書宇遠東商銀","書宇富邦","晴儀華南","晴儀台新","晴儀中國信託","晴儀星展","晴儀元大","晴儀富邦"];

function RecordForm({ isEdit, initialForm, categories, calcIcon, creditCards, onSubmit, onClose }) {
  const [form,      setForm]      = useState({ date:today(), item:"", note:"", catMain:"", catSub:"", payment:"cash", creditCard:"", amount:"", ...initialForm });
  const [formError, setFormError] = useState("");
  const [showCalc,  setShowCalc]  = useState(false);
  const selectedMain = findMain(categories, form.catMain);

  const inputSt={width:"100%",padding:"11px 13px",borderRadius:11,border:`1.5px solid ${T.border}`,fontSize:14,color:T.ink,outline:"none",background:T.bg,boxSizing:"border-box",fontFamily:"inherit"};
  const labelSt={fontSize:11,fontWeight:700,color:T.muted,marginBottom:5,letterSpacing:0.8,display:"block"};
  const chipSt=(active,color,light)=>({padding:"7px 12px",borderRadius:10,border:`1.5px solid ${active?color:T.border}`,background:active?light:"#fff",color:active?color:T.muted,fontSize:13,fontWeight:active?700:500,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5});

  async function handleSubmit() {
    if(!form.item.trim()) return setFormError("請輸入品項名稱");
    if(!form.catMain)     return setFormError("請選擇分類");
    if(!form.amount||isNaN(form.amount)||toMoney(form.amount)<=0) return setFormError("請輸入有效金額");
    if(form.payment==="card"&&!form.creditCard) return setFormError("請選擇使用的信用卡");
    await onSubmit({...form, amount:toMoney(form.amount)});
  }

  return (
    <>
      <div style={{position:"fixed",inset:0,background:"rgba(44,44,44,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:999,backdropFilter:"blur(3px)"}}
        onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div style={{background:T.card,borderRadius:"24px 24px 0 0",padding:"22px 18px 32px",width:"100%",maxWidth:420,maxHeight:"92vh",overflowY:"auto"}}>

          {/* 標題 */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {isEdit && (
                <span style={{fontSize:11,background:T.warmLight,color:T.warm,borderRadius:8,padding:"3px 10px",fontWeight:700,letterSpacing:0.5}}>
                  編輯中
                </span>
              )}
              <div style={{fontSize:17,fontWeight:700,color:T.ink}}>{isEdit?"編輯支出":"新增支出"}</div>
            </div>
            <button onClick={onClose} style={{background:T.bg,border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",color:T.muted,fontSize:15}}>✕</button>
          </div>

          <div style={{marginBottom:13}}>
            <label style={labelSt}>日期</label>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inputSt}/>
          </div>
          <div style={{marginBottom:13}}>
            <label style={labelSt}>品項名稱 *</label>
            <input type="text" placeholder="例：拿鐵咖啡" value={form.item} onChange={e=>setForm(f=>({...f,item:e.target.value}))} style={inputSt}/>
          </div>
          <div style={{marginBottom:13}}>
            <label style={labelSt}>說明（選填）</label>
            <input type="text" placeholder="備注這筆花費…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={inputSt}/>
          </div>
          <div style={{marginBottom:13}}>
            <label style={labelSt}>金額（NT$）*</label>
            <div style={{display:"flex",gap:8}}>
              <input type="number" placeholder="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                style={{...inputSt,flex:1,fontSize:20,fontWeight:700,textAlign:"right"}}/>
              <button onClick={()=>setShowCalc(true)}
                style={{padding:0,background:T.accentLight,border:`1.5px solid ${T.accent}44`,borderRadius:11,cursor:"pointer",flexShrink:0,width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",fontSize:24}}>
                {calcIcon.img?<img src={calcIcon.img} alt="" style={{width:32,height:32,objectFit:"cover",borderRadius:6}}/>:<span>{calcIcon.emoji||"🧮"}</span>}
              </button>
            </div>
          </div>
          <div style={{marginBottom:13}}>
            <label style={labelSt}>分類 *</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:8}}>
              {categories.map(c=>(
                <button key={c.id} onClick={()=>setForm(f=>({...f,catMain:c.id,catSub:""}))} style={chipSt(form.catMain===c.id,T.accent,T.accentLight)}>
                  <span style={{width:18,height:18,borderRadius:5,overflow:"hidden",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:13,background:T.accentLight,flexShrink:0}}>
                    {c.img?<img src={c.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:c.icon}
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
            {selectedMain && selectedMain.sub.length>0 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:6,paddingLeft:4,borderLeft:`3px solid ${T.accentLight}`,marginLeft:2}}>
                {selectedMain.sub.map(s=>(
                  <button key={s.id} onClick={()=>setForm(f=>({...f,catSub:s.id}))} style={{...chipSt(form.catSub===s.id,T.accent,T.accentLight),fontSize:12,padding:"5px 10px",background:form.catSub===s.id?T.accentLight:"#EDE8E1"}}>
                    <span style={{width:15,height:15,borderRadius:4,overflow:"hidden",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,background:"rgba(0,0,0,0.06)",flexShrink:0}}>
                      {s.img?<img src={s.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:s.icon}
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{marginBottom:form.payment==="card"?10:16}}>
            <label style={labelSt}>付款方式</label>
            <div style={{display:"flex",gap:8}}>
              {PAYMENT_METHODS.map(p=>(
                <button key={p.id} onClick={()=>setForm(f=>({...f,payment:p.id,creditCard:""}))} style={{...chipSt(form.payment===p.id,T.warm,T.warmLight),flex:1,justifyContent:"center"}}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 信用卡別選擇（付款方式為信用卡時才顯示）*/}
          {form.payment==="card" && (
            <div style={{marginBottom:16}}>
              <label style={labelSt}>信用卡別 *</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {creditCards.map(c=>(
                  <button key={c} onClick={()=>setForm(f=>({...f,creditCard:c}))}
                    style={{padding:"6px 12px",borderRadius:10,border:`1.5px solid ${form.creditCard===c?T.warm:T.border}`,background:form.creditCard===c?T.warmLight:"#fff",color:form.creditCard===c?T.warm:T.muted,fontSize:12,fontWeight:form.creditCard===c?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formError&&<div style={{fontSize:12,color:T.danger,marginBottom:10,textAlign:"center"}}>{formError}</div>}

          <button onClick={handleSubmit}
            style={{width:"100%",padding:15,background:T.accent,color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"inherit"}}>
            {isEdit ? "✓ 儲存修改" : "儲存記錄"}
          </button>
        </div>
      </div>
      {showCalc && (
        <Calculator initial={form.amount} calcIcon={calcIcon}
          onConfirm={v=>{setForm(f=>({...f,amount:String(v)}));setShowCalc(false);}}
          onClose={()=>setShowCalc(false)}/>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════
// 設定頁
// ══════════════════════════════════════════════════════
function SettingsTab({ categories, onSaveCategories, calcIcon, setCalcIcon }) {
  const [section,      setSection]      = useState("calc");
  const [localCats,    setLocalCats]    = useState(categories);
  const [expandedMain, setExpandedMain] = useState(null);
  const [editMain,     setEditMain]     = useState(null);
  const [editSub,      setEditSub]      = useState(null);
  const [draftMain,    setDraftMain]    = useState({label:"",icon:"",img:null});
  const [draftSub,     setDraftSub]     = useState({label:"",icon:"",img:null});
  const [saveStatus,   setSaveStatus]   = useState("");
  const mainImgRef=useRef(null), subImgRef=useRef(null), calcImgRef=useRef(null);

  useEffect(()=>{setLocalCats(categories);},[categories]);

  async function handleSave() {
    setSaveStatus("saving");
    try { await onSaveCategories(localCats); setSaveStatus("saved"); setTimeout(()=>setSaveStatus(""),2500); }
    catch { setSaveStatus("error"); setTimeout(()=>setSaveStatus(""),3000); }
  }
  function saveMain() {
    if(!draftMain.label.trim())return;
    if(editMain==="new") setLocalCats(p=>[...p,{id:uid(),label:draftMain.label.trim(),icon:draftMain.icon||"✦",img:draftMain.img,sub:[]}]);
    else setLocalCats(p=>p.map(c=>c.id===editMain?{...c,...draftMain}:c));
    setEditMain(null);
  }
  function saveSub() {
    if(!draftSub.label.trim())return;
    setLocalCats(p=>p.map(c=>{
      if(c.id!==editSub.mainId)return c;
      if(editSub.subId==="new")return{...c,sub:[...c.sub,{id:uid(),label:draftSub.label.trim(),icon:draftSub.icon||"✦",img:draftSub.img}]};
      return{...c,sub:c.sub.map(s=>s.id===editSub.subId?{...s,...draftSub}:s)};
    }));
    setEditSub(null);
  }
  async function handleImg(file,cb){
    const raw=await new Promise(res=>imgReader(file,res));
    cb(await compressImage(raw));
  }
  const iSt={width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,outline:"none",background:T.bg,boxSizing:"border-box",fontFamily:"inherit"};
  const bSt=(bg,cl)=>({padding:"7px 12px",borderRadius:9,border:"none",background:bg,color:cl,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0});

  return (
    <div>
      {(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:T.ink}}>管理分類</div>
            <button onClick={handleSave}
              style={{padding:"8px 18px",background:saveStatus==="saved"?"#6ab187":saveStatus==="error"?T.danger:T.accent,color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              {saveStatus==="saving"?"儲存中…":saveStatus==="saved"?"✓ 已儲存":saveStatus==="error"?"失敗，重試":"儲存分類"}
            </button>
          </div>
          <div style={{fontSize:11,color:T.muted,marginBottom:12,background:T.warmLight,borderRadius:10,padding:"8px 12px"}}>
            💡 修改完畢後請按「儲存分類」，才會永久保存
          </div>

          {localCats.map(cat=>(
            <div key={cat.id} style={{background:T.card,borderRadius:14,marginBottom:10,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              {editMain===cat.id?(
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                    <div style={{width:42,height:42,borderRadius:11,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,overflow:"hidden",flexShrink:0,cursor:"pointer"}} onClick={()=>mainImgRef.current?.click()}>
                      {draftMain.img?<img src={draftMain.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:(draftMain.icon||"✦")}
                    </div>
                    <input value={draftMain.label} onChange={e=>setDraftMain(d=>({...d,label:e.target.value}))} placeholder="大分類名稱" style={{...iSt,flex:1}}/>
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <input value={draftMain.icon} onChange={e=>setDraftMain(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{...iSt,flex:1,fontSize:16}}/>
                    <button onClick={()=>mainImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>上傳圖片</button>
                    <input ref={mainImgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleImg(f,d=>setDraftMain(dm=>({...dm,img:d,icon:""})));}}/>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={saveMain} style={{...bSt(T.accent,"#fff"),flex:1}}>確認</button>
                    <button onClick={()=>setEditMain(null)} style={{...bSt(T.border,T.muted),flex:1}}>取消</button>
                  </div>
                </div>
              ):(
                <div style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setExpandedMain(v=>v===cat.id?null:cat.id)}>
                  <CatThumb item={cat} size={18} box={34}/>
                  <span style={{flex:1,fontSize:14,fontWeight:600,color:T.ink}}>{cat.label}</span>
                  <span style={{fontSize:11,color:T.muted,marginRight:4}}>{cat.sub.length} 小類</span>
                  <button onClick={e=>{e.stopPropagation();setEditMain(cat.id);setDraftMain({label:cat.label,icon:cat.icon,img:cat.img||null});}} style={{...bSt("none",T.accent),border:`1px solid ${T.accent}`,padding:"3px 9px"}}>編輯</button>
                  <button onClick={e=>{e.stopPropagation();setLocalCats(p=>p.filter(c=>c.id!==cat.id));}} style={{...bSt("none",T.muted),border:`1px solid ${T.border}`,padding:"3px 9px"}}>刪除</button>
                  <span style={{fontSize:12,color:T.muted}}>{expandedMain===cat.id?"▲":"▼"}</span>
                </div>
              )}

              {expandedMain===cat.id&&(
                <div style={{borderTop:`1px solid ${T.border}`,background:"#fafaf8"}}>
                  {cat.sub.map(sub=>(
                    <div key={sub.id}>
                      {editSub?.mainId===cat.id&&editSub?.subId===sub.id?(
                        <div style={{padding:"10px 14px 10px 50px"}}>
                          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:7}}>
                            <div style={{width:36,height:36,borderRadius:9,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,overflow:"hidden",flexShrink:0,cursor:"pointer"}} onClick={()=>subImgRef.current?.click()}>
                              {draftSub.img?<img src={draftSub.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:(draftSub.icon||"✦")}
                            </div>
                            <input value={draftSub.label} onChange={e=>setDraftSub(d=>({...d,label:e.target.value}))} placeholder="小分類名稱" style={{...iSt,flex:1}}/>
                          </div>
                          <div style={{display:"flex",gap:8,marginBottom:7}}>
                            <input value={draftSub.icon} onChange={e=>setDraftSub(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{...iSt,flex:1,fontSize:15}}/>
                            <button onClick={()=>subImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>上傳圖片</button>
                            <input ref={subImgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleImg(f,d=>setDraftSub(ds=>({...ds,img:d,icon:""})));}}/>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={saveSub} style={{...bSt(T.accent,"#fff"),flex:1}}>確認</button>
                            <button onClick={()=>setEditSub(null)} style={{...bSt(T.border,T.muted),flex:1}}>取消</button>
                          </div>
                        </div>
                      ):(
                        <div style={{padding:"9px 14px 9px 50px",display:"flex",alignItems:"center",gap:9,borderBottom:`1px solid ${T.border}`}}>
                          <CatThumb item={sub} size={14} box={28}/>
                          <span style={{flex:1,fontSize:13,color:T.ink}}>{sub.label}</span>
                          <button onClick={()=>{setEditSub({mainId:cat.id,subId:sub.id});setDraftSub({label:sub.label,icon:sub.icon,img:sub.img||null});}} style={{...bSt("none",T.accent),border:`1px solid ${T.accent}`,padding:"2px 8px",fontSize:11}}>編輯</button>
                          <button onClick={()=>setLocalCats(p=>p.map(c=>c.id===cat.id?{...c,sub:c.sub.filter(s=>s.id!==sub.id)}:c))} style={{...bSt("none",T.muted),border:`1px solid ${T.border}`,padding:"2px 8px",fontSize:11}}>刪除</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {editSub?.mainId===cat.id&&editSub?.subId==="new"?(
                    <div style={{padding:"10px 14px 10px 50px"}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:7}}>
                        <div style={{width:36,height:36,borderRadius:9,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,overflow:"hidden",flexShrink:0,cursor:"pointer"}} onClick={()=>subImgRef.current?.click()}>
                          {draftSub.img?<img src={draftSub.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🏷️"}
                        </div>
                        <input value={draftSub.label} onChange={e=>setDraftSub(d=>({...d,label:e.target.value}))} placeholder="新小分類名稱" autoFocus style={{...iSt,flex:1}}/>
                      </div>
                      <div style={{display:"flex",gap:8,marginBottom:7}}>
                        <input value={draftSub.icon} onChange={e=>setDraftSub(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{...iSt,flex:1,fontSize:15}}/>
                        <button onClick={()=>subImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>上傳圖片</button>
                        <input ref={subImgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleImg(f,d=>setDraftSub(ds=>({...ds,img:d,icon:""})));}}/>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={saveSub} style={{...bSt(T.accent,"#fff"),flex:1}}>新增</button>
                        <button onClick={()=>setEditSub(null)} style={{...bSt(T.border,T.muted),flex:1}}>取消</button>
                      </div>
                    </div>
                  ):(
                    <button onClick={()=>{setEditSub({mainId:cat.id,subId:"new"});setDraftSub({label:"",icon:"",img:null});}}
                      style={{width:"100%",padding:"9px 14px 9px 50px",background:"none",border:"none",color:T.accent,fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                      ＋ 新增小分類
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {editMain==="new"?(
            <div style={{background:T.card,borderRadius:14,padding:"12px 14px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <div style={{width:42,height:42,borderRadius:11,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,overflow:"hidden",flexShrink:0,cursor:"pointer"}} onClick={()=>mainImgRef.current?.click()}>
                  {draftMain.img?<img src={draftMain.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:(draftMain.icon||"🏷️")}
                </div>
                <input value={draftMain.label} onChange={e=>setDraftMain(d=>({...d,label:e.target.value}))} placeholder="新大分類名稱" autoFocus style={{...iSt,flex:1}}/>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input value={draftMain.icon} onChange={e=>setDraftMain(d=>({...d,icon:e.target.value,img:null}))} placeholder="Emoji" style={{...iSt,flex:1,fontSize:16}}/>
                <button onClick={()=>mainImgRef.current?.click()} style={bSt(T.warmLight,T.warm)}>上傳圖片</button>
                <input ref={mainImgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleImg(f,d=>setDraftMain(dm=>({...dm,img:d,icon:""})));}}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={saveMain} style={{...bSt(T.accent,"#fff"),flex:1}}>新增</button>
                <button onClick={()=>setEditMain(null)} style={{...bSt(T.border,T.muted),flex:1}}>取消</button>
              </div>
            </div>
          ):(
            <button onClick={()=>{setEditMain("new");setDraftMain({label:"",icon:"",img:null});}}
              style={{width:"100%",padding:13,background:"none",color:T.accent,border:`1.5px solid ${T.accent}`,borderRadius:14,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
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
// ══════════════════════════════════════════════════════
// 比價 Modal
// ══════════════════════════════════════════════════════
function CompareModal({
  compareItems, comparePrices, compareView, setCompareView,
  showItemForm, setShowItemForm, showPriceForm, setShowPriceForm,
  itemFormName, setItemFormName, itemFormUnit, setItemFormUnit,
  priceForm, setPriceForm, editItemId, setEditItemId,
  addCompareItem, addComparePrice, onClose, db, T, cardSt, fmt
}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:1050,background:T.bg,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* 頂部 bar */}
        <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:"18px 18px 14px",flexShrink:0,paddingTop:"max(18px, env(safe-area-inset-top))"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:compareView!==null?8:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {compareView!==null && (
                <button onClick={()=>{ setCompareView(null); setShowPriceForm(false); }}
                  style={{padding:"7px 12px",border:`1.5px solid ${T.border}`,borderRadius:9,background:"none",color:T.muted,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  ← 返回
                </button>
              )}
              <div>
                <div style={{fontSize:18,fontWeight:700,color:T.ink,letterSpacing:-0.3}}>
                  {compareView===null ? "🏷️ 比價" : `🏷️ ${compareItems.find(i=>i.id===compareView)?.name||""}`}
                </div>
                {compareView===null&&<div style={{fontSize:12,color:T.muted,marginTop:1}}>點品項查看比價排行</div>}
              </div>
            </div>
            <button onClick={onClose}
              style={{padding:"7px 14px",borderRadius:9,background:T.accentLight,border:`1.5px solid ${T.accent}44`,color:T.accent,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              返回主畫面
            </button>
          </div>
        </div>

        {/* 內容區（可滾動）*/}
        <div style={{overflowY:"auto",flex:1,padding:16}}>

          {compareView===null ? (
            /* ── 品項列表 ── */
            <>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                <button onClick={()=>{ setShowItemForm(v=>!v); setItemFormName(""); setItemFormUnit(""); setEditItemId(null); }}
                  style={{padding:"8px 16px",background:showItemForm?T.accent:"none",color:showItemForm?"#fff":T.accent,border:`1.5px solid ${T.accent}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {showItemForm?"✕ 取消":"＋ 新增品項"}
                </button>
              </div>

              {showItemForm && (
                <div style={{...cardSt,background:T.accentLight,marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:10}}>{editItemId?"編輯品項":"新增比價品項"}</div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>品項名稱 *</div>
                    <input value={itemFormName} onChange={e=>setItemFormName(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter") addCompareItem(); }}
                      placeholder="例：鮮奶、蘋果、優格"
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:14,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}
                      autoFocus/>
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>單位量詞 *（計算單價用）</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                      {["ml","g","公克","顆","個","片","包","盒","瓶","罐"].map(u=>(
                        <button key={u} onClick={()=>setItemFormUnit(u)}
                          style={{padding:"5px 11px",borderRadius:8,border:`1.5px solid ${itemFormUnit===u?T.accent:T.border}`,background:itemFormUnit===u?T.accentLight:"#fff",color:itemFormUnit===u?T.accent:T.muted,fontSize:12,fontWeight:itemFormUnit===u?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                          {u}
                        </button>
                      ))}
                    </div>
                    <input value={itemFormUnit} onChange={e=>setItemFormUnit(e.target.value)}
                      placeholder="或自行輸入量詞"
                      style={{width:"100%",padding:"8px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  </div>
                  <button onClick={addCompareItem}
                    style={{width:"100%",padding:"10px 0",background:T.accent,color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {editItemId?"儲存":"新增品項"}
                  </button>
                </div>
              )}

              {compareItems.length===0 && !showItemForm && (
                <div style={{textAlign:"center",color:T.muted,padding:"48px 0",fontSize:14}}>
                  <div style={{fontSize:36,marginBottom:10}}>🏷️</div>
                  還沒有比價品項<br/>點「＋ 新增品項」開始
                </div>
              )}

              {compareItems.map(item=>{
                const prices = comparePrices.filter(p=>p.itemId===item.id).sort((a,b)=>a.unitCost-b.unitCost);
                const best   = prices[0];
                return (
                  <div key={item.id} style={{...cardSt,cursor:"pointer"}} onClick={()=>{ setCompareView(item.id); setShowPriceForm(false); }}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:42,height:42,borderRadius:12,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🏷️</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:14,fontWeight:700,color:T.ink}}>{item.name}</span>
                          {item.unit&&<span style={{fontSize:11,background:T.warmLight,color:T.warm,borderRadius:6,padding:"1px 7px",fontWeight:600}}>/{item.unit}</span>}
                        </div>
                        {best ? (
                          <div style={{fontSize:11,color:T.muted,marginTop:3}}>
                            最優惠 <span style={{color:T.accent,fontWeight:700}}>{best.store}</span>
                            {" · 單價 "}<span style={{color:T.accent,fontWeight:700}}>NT$ {best.unitCost}</span>/{item.unit||"單位"}
                          </div>
                        ) : <div style={{fontSize:11,color:T.muted,marginTop:3}}>尚未有記錄</div>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                        <span style={{fontSize:12,color:T.muted}}>{prices.length} 筆 ›</span>
                        <div style={{display:"flex",gap:5}}>
                          <button onClick={e=>{ e.stopPropagation(); setEditItemId(item.id); setItemFormName(item.name); setItemFormUnit(item.unit||""); setShowItemForm(true); }}
                            style={{fontSize:11,color:T.accent,background:T.accentLight,border:`1px solid ${T.accent}44`,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                            編輯
                          </button>
                          <button onClick={async e=>{ e.stopPropagation();
                            await deleteDoc(doc(db,"compareItems",item.id));
                            comparePrices.filter(p=>p.itemId===item.id).forEach(p=>deleteDoc(doc(db,"comparePrices",p.id)));
                          }} style={{fontSize:11,color:T.muted,background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                            刪除
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            /* ── 品項比價詳細頁 ── */
            (()=>{
              const item   = compareItems.find(i=>i.id===compareView);
              if(!item) return null;
              const unit   = item.unit || "單位";
              const prices = comparePrices.filter(p=>p.itemId===compareView).sort((a,b)=>a.unitCost-b.unitCost);
              return (
                <>
                  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                    <button onClick={()=>setShowPriceForm(v=>!v)}
                      style={{padding:"8px 16px",background:showPriceForm?T.accent:"none",color:showPriceForm?"#fff":T.accent,border:`1.5px solid ${T.accent}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      {showPriceForm?"✕ 取消":"＋ 新增記錄"}
                    </button>
                  </div>

                  {/* 新增價格表單 */}
                  {showPriceForm && (
                    <div style={{...cardSt,background:T.accentLight,marginBottom:14}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:10}}>新增比價記錄</div>
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>購買地點 *</div>
                        <input value={priceForm.store} onChange={e=>setPriceForm(f=>({...f,store:e.target.value}))}
                          placeholder="例：家樂福、全聯、7-11"
                          style={{width:"100%",padding:"9px 11px",borderRadius:9,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                      </div>
                      <div style={{display:"flex",gap:8,marginBottom:8}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>價格（NT$）*</div>
                          <input type="number" value={priceForm.price} onChange={e=>setPriceForm(f=>({...f,price:e.target.value}))}
                            placeholder="0"
                            style={{width:"100%",padding:"9px 11px",borderRadius:9,border:`1.5px solid ${T.border}`,fontSize:15,fontWeight:700,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit",textAlign:"right"}}/>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>規格數量（{unit}）</div>
                          <input type="number" value={priceForm.specQty} onChange={e=>setPriceForm(f=>({...f,specQty:e.target.value}))}
                            placeholder={`數量（${unit}）`}
                            style={{width:"100%",padding:"9px 11px",borderRadius:9,border:`1.5px solid ${T.border}`,fontSize:15,fontWeight:700,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit",textAlign:"right"}}/>
                        </div>
                      </div>
                      {/* 即時預覽單價 */}
                      {priceForm.price&&priceForm.specQty&&+priceForm.specQty>0 && (
                        <div style={{background:"#fff",borderRadius:9,padding:"8px 12px",marginBottom:8,border:`1px solid ${T.accent}44`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:12,color:T.muted}}>單價預覽</span>
                          <span style={{fontSize:15,fontWeight:700,color:T.accent}}>
                            NT$ {(+priceForm.price / +priceForm.specQty).toFixed(2)} / {unit}
                          </span>
                        </div>
                      )}
                      <div style={{marginBottom:12}}>
                        <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>備註（選填）</div>
                        <input value={priceForm.note} onChange={e=>setPriceForm(f=>({...f,note:e.target.value}))}
                          placeholder="例：特價期間、會員優惠…"
                          style={{width:"100%",padding:"9px 11px",borderRadius:9,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                      </div>
                      <button onClick={()=>addComparePrice(compareView)}
                        style={{width:"100%",padding:"11px 0",background:T.accent,color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ 送出記錄
                      </button>
                    </div>
                  )}

                  {/* 比價排行 */}
                  {prices.length===0 ? (
                    <div style={{textAlign:"center",color:T.muted,padding:"40px 0",fontSize:14}}>
                      <div style={{fontSize:28,marginBottom:8}}>📊</div>
                      還沒有記錄，點「＋ 新增記錄」加入
                    </div>
                  ) : (
                    <>
                      <div style={{fontSize:12,fontWeight:700,color:T.muted,marginBottom:10,letterSpacing:0.5}}>
                        比價排行（單價由低到高）
                      </div>
                      {prices.map((p,i)=>{
                        const isFirst = i===0;
                        const isLast  = i===prices.length-1 && prices.length>1;
                        return (
                          <div key={p.id} style={{
                            ...cardSt, marginBottom:8,
                            border:`1.5px solid ${isFirst?"#6ab187":isLast?"#FFCCCC":T.border}`,
                            background:isFirst?"#EDF6EF":isLast?"#FFF8F8":T.card,
                          }}>
                            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                              <div style={{width:34,height:34,borderRadius:10,background:isFirst?"#6ab187":isLast?"#FFD0D0":T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:isFirst?18:14,fontWeight:700,color:isFirst?"#fff":isLast?"#C0392B":T.muted,flexShrink:0}}>
                                {isFirst?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>{p.store}</div>
                                {p.note&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>{p.note}</div>}
                                <div style={{fontSize:11,color:T.muted,marginTop:3}}>
                                  售價 <span style={{fontWeight:600,color:T.ink}}>NT$ {p.price}</span>
                                  {p.specQty&&<span>　規格 <span style={{fontWeight:600,color:T.ink}}>{p.specQty}{unit}</span></span>}
                                </div>
                              </div>
                              <div style={{textAlign:"right",flexShrink:0}}>
                                <div style={{fontSize:18,fontWeight:800,color:isFirst?T.accent:T.ink}}>
                                  {p.unitCost.toFixed(2)}
                                </div>
                                <div style={{fontSize:11,color:T.muted}}>元/{unit}</div>
                              </div>
                              <button onClick={()=>deleteDoc(doc(db,"comparePrices",p.id))}
                                style={{fontSize:14,color:T.border,background:"none",border:"none",cursor:"pointer",padding:"2px",flexShrink:0,marginTop:2}}>✕</button>
                            </div>
                          </div>
                        );
                      })}

                      {/* 價差分析 */}
                      {prices.length>1 && (
                        <div style={{background:T.accentLight,borderRadius:12,padding:"11px 14px",marginTop:4}}>
                          <div style={{fontSize:11,fontWeight:700,color:T.accent,marginBottom:5}}>💡 價差分析</div>
                          <div style={{fontSize:13,color:T.ink}}>
                            選 <span style={{fontWeight:700,color:T.accent}}>{prices[0].store}</span> 比 <span style={{fontWeight:700,color:"#C0392B"}}>{prices[prices.length-1].store}</span> 每 {unit} 省{" "}
                            <span style={{fontWeight:700,color:T.accent}}>NT$ {(prices[prices.length-1].unitCost - prices[0].unitCost).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()
          )}
        </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 信用卡管理元件
// ══════════════════════════════════════════════════════
function CreditCardManager({ creditCards, onSave, accentLight, accent, border, ink, muted }) {
  const [show,     setShow]     = useState(false);
  const [newCard,  setNewCard]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  // 即時新增：直接寫入 Firebase
  async function handleAdd() {
    const name = newCard.trim();
    if(!name) return;
    if(creditCards.includes(name)) return; // 避免重複
    const newList = [...creditCards, name];
    setSaving(true);
    await onSave(newList);
    setSaving(false);
    setSaved(true);
    setTimeout(()=>setSaved(false), 1800);
    setNewCard("");
  }

  // 即時刪除：直接寫入 Firebase
  async function handleDelete(idx) {
    const newList = creditCards.filter((_,i)=>i!==idx);
    await onSave(newList);
  }

  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:show?10:0}}>
        <div style={{fontSize:11,color:muted,fontWeight:600}}>共 {creditCards.length} 張信用卡</div>
        <button onClick={()=>{ setShow(v=>!v); setNewCard(""); }}
          style={{padding:"6px 14px",background:show?accent:"none",color:show?"#fff":accent,border:`1.5px solid ${accent}`,borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          {show?"✕ 關閉":"⚙️ 管理信用卡"}
        </button>
      </div>

      {show && (
        <div style={{background:accentLight,borderRadius:14,padding:"14px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:ink}}>信用卡清單</div>
            {saved&&<div style={{fontSize:11,color:"#6ab187",fontWeight:700}}>✓ 已同步</div>}
          </div>
          <div style={{marginBottom:12}}>
            {creditCards.map((c,i)=>(
              <div key={c+i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 11px",background:"#fff",borderRadius:9,marginBottom:6,border:`1px solid ${border}`}}>
                <span style={{fontSize:13,color:ink,fontWeight:500}}>💳 {c}</span>
                <button onClick={()=>handleDelete(i)}
                  style={{fontSize:11,color:muted,background:"none",border:`1px solid ${border}`,borderRadius:6,padding:"3px 9px",cursor:"pointer",fontFamily:"inherit"}}>
                  刪除
                </button>
              </div>
            ))}
            {creditCards.length===0&&(
              <div style={{fontSize:12,color:muted,textAlign:"center",padding:"10px 0"}}>尚未有信用卡</div>
            )}
          </div>
          {/* 新增輸入列 */}
          <div style={{display:"flex",gap:8}}>
            <input value={newCard} onChange={e=>setNewCard(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter") handleAdd(); }}
              placeholder="輸入新信用卡名稱"
              style={{flex:1,padding:"9px 11px",borderRadius:9,border:`1.5px solid ${border}`,fontSize:13,color:ink,background:"#fff",outline:"none",fontFamily:"inherit"}}/>
            <button onClick={handleAdd} disabled={saving}
              style={{padding:"9px 16px",background:saving?"#aaa":accent,color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:saving?"not-allowed":"pointer",fontFamily:"inherit",flexShrink:0}}>
              {saving?"…":"＋ 新增"}
            </button>
          </div>
          <div style={{fontSize:11,color:muted,marginTop:8}}>💡 新增或刪除後立即同步到所有裝置</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [records,     setRecords]     = useState([]);
  const [categories,  setCategories]  = useState(DEFAULT_CATEGORIES);
  const [calcIcon,    setCalcIcon]    = useState({emoji:"🧮",img:null});
  const [footerImg,   setFooterImg]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState("home");
  // formState: null | { mode:"add" } | { mode:"edit", record:{...} }
  const [formState,   setFormState]   = useState(null);
  const [filterMonth,  setFilterMonth]  = useState(today().slice(0,7));
  const [filterCat,    setFilterCat]    = useState(""); // "" = 全部
  const [showExport,   setShowExport]   = useState(false);
  const [exportFrom,   setExportFrom]   = useState("");
  const [exportTo,     setExportTo]     = useState("");
  const [exportMode,   setExportMode]   = useState("all");
  const payMap = Object.fromEntries(PAYMENT_METHODS.map(p=>[p.id,p]));

  useEffect(()=>{ const u=onSnapshot(collection(db,"records"),snap=>{ setRecords(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }); return u; },[]);
  useEffect(()=>{ const u=onSnapshot(doc(db,"settings","categories"),snap=>{ if(snap.exists()&&snap.data().list?.length>0) setCategories(snap.data().list); }); return u; },[]);
  useEffect(()=>{ const u=onSnapshot(doc(db,"settings","calcIcon"),snap=>{ if(snap.exists()) setCalcIcon(snap.data()); }); return u; },[]);
  useEffect(()=>{ const u=onSnapshot(doc(db,"settings","footerImg"),snap=>{ if(snap.exists()) setFooterImg(snap.data().url||null); }); return u; },[]);
  useEffect(()=>{ setDoc(doc(db,"settings","calcIcon"),calcIcon); },[calcIcon]);

  // ── 信用卡 & 存款 ──
  const [creditBills,  setCreditBills]  = useState([]);
  const [savingsRecs,  setSavingsRecs]  = useState([]);
  const [showCreditForm,  setShowCreditForm]  = useState(false);
  const [showSavingsForm, setShowSavingsForm] = useState(false);
  const [creditForm,  setCreditForm]  = useState({dueDate:"",card:"",amount:"",note:""});
  const [editCreditId, setEditCreditId] = useState(null); // 編輯中的帳單 id
  const [savingsForm, setSavingsForm] = useState({date:today(),bank:"",balance:""});
  const [creditFilterMonth, setCreditFilterMonth] = useState(today().slice(0,7));

  useEffect(()=>{ const u=onSnapshot(collection(db,"creditBills"),snap=>{ setCreditBills(snap.docs.map(d=>({id:d.id,...d.data()}))); }); return u; },[]);
  useEffect(()=>{ const u=onSnapshot(collection(db,"savingsRecs"),snap=>{ setSavingsRecs(snap.docs.map(d=>({id:d.id,...d.data()}))); }); return u; },[]);

  // creditCards managed via state
  const SAVINGS_BANKS = ["晴儀郵局","晴儀富邦","晴儀將來","晴儀華南","晴儀台新","書宇郵局","書宇台銀"];

  const [incomeRecs,     setIncomeRecs]     = useState([]);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [incomeForm,     setIncomeForm]     = useState({date:today(),person:"吳書宇",category:"薪資收入",amount:"",note:""});
  const [incomeFilterMonth, setIncomeFilterMonth] = useState(today().slice(0,7));
  const INCOME_PERSONS     = ["吳書宇","楊晴儀"];
  const INCOME_CATEGORIES  = ["薪資收入","其他工資收入","其他收入"];

  useEffect(()=>{ const u=onSnapshot(collection(db,"incomeRecs"),snap=>{ setIncomeRecs(snap.docs.map(d=>({id:d.id,...d.data()}))); }); return u; },[]);

  async function addIncomeRec() {
    if(!incomeForm.date||!incomeForm.person||!incomeForm.category||!incomeForm.amount||isNaN(incomeForm.amount)||toMoney(incomeForm.amount)<=0) return;
    await addDoc(collection(db,"incomeRecs"),{...incomeForm,amount:toMoney(incomeForm.amount),month:incomeForm.date.slice(0,7)});
    setIncomeForm({date:today(),person:"吳書宇",category:"薪資收入",amount:"",note:""});
    setShowIncomeForm(false);
  }

  async function addCreditBill() {
    if(!creditForm.dueDate||!creditForm.card||!creditForm.amount||isNaN(creditForm.amount)||toMoney(creditForm.amount)<=0) return;
    if(editCreditId) {
      // 編輯模式：更新現有記錄
      await setDoc(doc(db,"creditBills",editCreditId),{
        ...creditForm, amount:toMoney(creditForm.amount), month:creditForm.dueDate.slice(0,7)
      });
      setEditCreditId(null);
    } else {
      await addDoc(collection(db,"creditBills"),{...creditForm,amount:toMoney(creditForm.amount),month:creditForm.dueDate.slice(0,7)});
    }
    setCreditForm({dueDate:"",card:"",amount:"",note:""});
    setShowCreditForm(false);
  }
  async function addSavingsRec() {
    if(!savingsForm.date||!savingsForm.bank||!savingsForm.balance||isNaN(savingsForm.balance)||toMoney(savingsForm.balance)<0) return;
    // 同一個銀行只保留最新一筆（用 setDoc 覆蓋）
    await setDoc(doc(db,"savingsRecs",savingsForm.bank),{...savingsForm,balance:toMoney(savingsForm.balance),updatedAt:today()});
    setSavingsForm({date:today(),bank:"",balance:""});
    setShowSavingsForm(false);
  }

  // ── 預算 ──
  const [budgets,        setBudgets]        = useState({});  // { catId: amount }
  const [totalBudget,    setTotalBudget]    = useState(0);   // 月總預算
  const [budgetMonth,    setBudgetMonth]    = useState(today().slice(0,7));
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetDraft,    setBudgetDraft]    = useState({});
  const [totalBudgetDraft, setTotalBudgetDraft] = useState("");

  // 信用卡清單（可自訂）
  const [creditCards,    setCreditCards]    = useState(DEFAULT_CREDIT_CARDS);
  const [newCardInput,   setNewCardInput]   = useState("");

  useEffect(()=>{
    const u=onSnapshot(doc(db,"settings","budgets"),snap=>{
      if(snap.exists()){
        setBudgets(snap.data().data||{});
        setTotalBudget(snap.data().total||0);
      }
    });
    return u;
  },[]);

  useEffect(()=>{
    const u=onSnapshot(doc(db,"settings","creditCards"),snap=>{
      if(snap.exists()&&snap.data().list?.length>0) setCreditCards(snap.data().list);
    });
    return u;
  },[]);

  async function saveBudgets(data, total) {
    await setDoc(doc(db,"settings","budgets"),{data, total:+total||0});
    setBudgets(data);
    setTotalBudget(+total||0);
  }

  async function saveCreditCards(list) {
    await setDoc(doc(db,"settings","creditCards"),{list});
    setCreditCards(list);
  }

  // 預算警示：本月各分類花費
  const budgetAlerts = categories.filter(c=>{
    const budget = budgets[c.id];
    if(!budget||+budget<=0) return false;
    const spent = records.filter(r=>r.date.startsWith(today().slice(0,7))&&r.catMain===c.id).reduce((s,r)=>s+r.amount,0);
    return (+budget - spent) < 1000;
  }).map(c=>{
    const budget = +budgets[c.id]||0;
    const spent  = records.filter(r=>r.date.startsWith(today().slice(0,7))&&r.catMain===c.id).reduce((s,r)=>s+r.amount,0);
    return { ...c, budget, spent, remaining: budget-spent };
  });

  // ── 固定支出 ──
  const [recurringItems, setRecurringItems] = useState([]);
  const [showRecurForm,  setShowRecurForm]  = useState(false);
  const [recurForm,      setRecurForm]      = useState({day:"1",item:"",catMain:"",catSub:"",payment:"cash",creditCard:"",amount:"",note:""});
  const recurCheckedRef = useRef(false);

  useEffect(()=>{
    const u=onSnapshot(collection(db,"recurringItems"),snap=>{
      setRecurringItems(snap.docs.map(d=>({id:d.id,...d.data()})));
    });
    return u;
  },[]);

  // 開啟 App 時自動檢查固定支出
  useEffect(()=>{
    if(recurCheckedRef.current||recurringItems.length===0||records.length===0) return;
    recurCheckedRef.current = true;
    const currentMonth = today().slice(0,7);
    const currentDay   = parseInt(today().slice(8,10));
    recurringItems.forEach(async item=>{
      const triggerDay = parseInt(item.day);
      if(currentDay < triggerDay) return; // 還沒到日期
      // 檢查本月是否已新增過
      const alreadyAdded = records.some(r=>
        r.recurringId===item.id && r.date.startsWith(currentMonth)
      );
      if(alreadyAdded) return;
      // 自動新增
      const targetDate = `${currentMonth}-${String(triggerDay).padStart(2,"0")}`;
      await addDoc(collection(db,"records"),{
        date: targetDate,
        item: item.item,
        note: item.note||"（固定支出）",
        catMain: item.catMain,
        catSub:  item.catSub||"",
        payment: item.payment,
        creditCard: item.creditCard||"",
        amount:  toMoney(item.amount),
        recurringId: item.id,
      });
    });
  },[recurringItems, records]);

  // ── 隨手記 (Quick Ledger) ──
  const [quickEntries,    setQuickEntries]    = useState([]);
  const [showQuickLedger, setShowQuickLedger] = useState(false);
  const [quickForm,       setQuickForm]       = useState({name:"",amount:"",note:""});
  const [quickCalcOpen,   setQuickCalcOpen]   = useState(false);
  const [quickSaving,     setQuickSaving]     = useState(false);

  useEffect(()=>{
    const u=onSnapshot(
      collection(db,"quickLedgerEntries"),
      snap=>{
        const docs=snap.docs.map(d=>({id:d.id,...d.data()}));
        docs.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        setQuickEntries(docs);
      }
    );
    return u;
  },[]);

  async function addQuickEntry(){
    const name=quickForm.name.trim();
    const amount=quickForm.amount;
    if(!name&&!amount) return;
    setQuickSaving(true);
    try{
      await addDoc(collection(db,"quickLedgerEntries"),{
        name, amount: amount===''?0:Number(amount),
        note:quickForm.note.trim(), done:false, createdAt:Date.now()
      });
      setQuickForm({name:"",amount:"",note:""});
    }finally{ setQuickSaving(false); }
  }

  async function toggleQuickDone(id, done){
    const {setDoc:_s,..._}={}; // unused — using imported setDoc
    await setDoc(doc(db,"quickLedgerEntries",id),{done},{ merge:true });
  }

  function fmtQuickTime(ts){
    const d=new Date(ts);
    const mm=d.getMonth()+1, dd=d.getDate();
    let h=d.getHours();
    const m=d.getMinutes().toString().padStart(2,"0");
    const ap=h<12?"上午":"下午";
    h=h%12; if(h===0)h=12;
    return `${mm}/${dd} ${ap}${h}:${m}`;
  }

  function hashRotate(id){
    let hash=0;
    for(let i=0;i<id.length;i++){ hash=(hash*31+id.charCodeAt(i))|0; }
    return (Math.abs(hash)%7)-3;
  }

  const QUICK_COLORS=[
    {bg:"#FFE3EC",pin:"#FF6B95"},
    {bg:"#FFF3CE",pin:"#FFC53D"},
    {bg:"#DFF7EF",pin:"#4FCBAE"},
    {bg:"#EBE2FF",pin:"#A88CFF"},
    {bg:"#FFE8D6",pin:"#E0956A"},
  ];

  async function addRecurringItem() {
    if(!recurForm.day||!recurForm.item||!recurForm.catMain||!recurForm.amount||isNaN(recurForm.amount)||toMoney(recurForm.amount)<=0) return;
    await addDoc(collection(db,"recurringItems"),{...recurForm,amount:toMoney(recurForm.amount)});
    setRecurForm({day:"1",item:"",catMain:"",catSub:"",payment:"cash",creditCard:"",amount:"",note:""});
    setShowRecurForm(false);
  }

  // ── 比價 ──
  const [showCompare,     setShowCompare]     = useState(false); // 比價 Modal
  const [compareItems,    setCompareItems]    = useState([]); // 大品項
  const [comparePrices,   setComparePrices]   = useState([]); // 各品項的價格記錄
  const [compareView,     setCompareView]     = useState(null); // 目前展開的品項 id
  const [showItemForm,    setShowItemForm]    = useState(false);
  const [showPriceForm,   setShowPriceForm]   = useState(false);
  const [itemFormName,    setItemFormName]    = useState("");
  const [itemFormUnit,    setItemFormUnit]    = useState(""); // 量詞，e.g. ml, 顆, g
  const [priceForm,       setPriceForm]       = useState({store:"",price:"",specQty:"",note:""});
  const [editItemId,      setEditItemId]      = useState(null); // 編輯品項名稱

  useEffect(()=>{
    const u=onSnapshot(collection(db,"compareItems"),snap=>{
      setCompareItems(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.name.localeCompare(b.name,"zh-TW")));
    });
    return u;
  },[]);

  useEffect(()=>{
    const u=onSnapshot(collection(db,"comparePrices"),snap=>{
      setComparePrices(snap.docs.map(d=>({id:d.id,...d.data()})));
    });
    return u;
  },[]);

  async function addCompareItem(){
    if(!itemFormName.trim()) return;
    if(editItemId){
      await setDoc(doc(db,"compareItems",editItemId),{name:itemFormName.trim(),unit:itemFormUnit.trim()},{merge:true});
      setEditItemId(null);
    } else {
      await addDoc(collection(db,"compareItems"),{name:itemFormName.trim(),unit:itemFormUnit.trim(),createdAt:Date.now()});
    }
    setItemFormName(""); setItemFormUnit(""); setShowItemForm(false);
  }

  async function addComparePrice(itemId){
    if(!priceForm.store.trim()||!priceForm.price||isNaN(priceForm.price)||+priceForm.price<=0) return;
    const specQty = toMoney(priceForm.specQty);
    const price   = toMoney(priceForm.price);
    // 單位成本 = 價格 ÷ 規格數量（若無規格則 unitCost = price），用 Math.round 避免浮點誤差
    const unitCost = (specQty>0) ? Math.round((price/specQty)*10000)/10000 : price;
    await addDoc(collection(db,"comparePrices"),{
      itemId, store:priceForm.store.trim(), price, specQty:specQty||null,
      note:priceForm.note.trim(), unitCost, createdAt:Date.now()
    });
    setPriceForm({store:"",price:"",specQty:"",note:""});
    setShowPriceForm(false);
  }

  async function saveCategories(cats) { await setDoc(doc(db,"settings","categories"),{list:cats}); setCategories(cats); }
  async function saveFooterImg(url)   { const c=await compressImage(url,800,0.8); setFooterImg(c); setDoc(doc(db,"settings","footerImg"),{url:c}); }
  function removeFooterImg()          { setFooterImg(null); setDoc(doc(db,"settings","footerImg"),{url:null}); }

  async function handleAdd(data)  { await addDoc(collection(db,"records"),data); setFormState(null); }
  async function handleEdit(data) {
    const {id, ...rest} = data;
    await updateDoc(doc(db,"records",formState.record.id), rest);
    setFormState(null);
  }

  const filtered   = records.filter(r=>r.date.startsWith(filterMonth)&&(!filterCat||r.catMain===filterCat)).sort((a,b)=>b.date.localeCompare(a.date));
  const totalMonth = filtered.reduce((s,r)=>s+r.amount,0);
  const catStats   = categories.map(c=>({...c,total:filtered.filter(r=>r.catMain===c.id).reduce((s,r)=>s+r.amount,0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
  const maxStat    = catStats[0]?.total||1;
  const payStats   = PAYMENT_METHODS.map(p=>({...p,total:filtered.filter(r=>r.payment===p.id).reduce((s,r)=>s+r.amount,0)})).filter(p=>p.total>0);
  const monthOpts  = [...new Set([filterMonth,...records.map(r=>r.date.slice(0,7))])].sort((a,b)=>b.localeCompare(a));
  const cardSt     = {background:T.card,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"};

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:"'Noto Serif TC',serif",color:T.muted,fontSize:16}}>
      ❤️ 載入中…
    </div>
  );

  return (
    <div style={{fontFamily:"'Noto Serif TC','Noto Sans TC',serif",background:T.bg,minHeight:"100vh",display:"flex",justifyContent:"center",padding:"0 0 48px"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:420}}>

        {/* HEADER */}
        <div style={{background:T.headerBg,borderBottom:`1px solid ${T.border}`,padding:"18px 18px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:T.ink,letterSpacing:-0.3}}>Toby and Yvette</div>
              <div style={{fontSize:12,color:T.muted,letterSpacing:0.3}}>的理財幫手 ❤️</div>
            </div>
            <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}
              style={{fontSize:12,color:T.muted,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 8px",background:T.bg,cursor:"pointer",fontFamily:"inherit"}}>
              {monthOpts.map(m=><option key={m} value={m}>{m.replace("-","年")}月</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:7,marginBottom:14}}>
            <button onClick={()=>setFormState({mode:"add"})}
              style={{flex:2,padding:"12px 0",background:T.accent,color:"#fff",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:0.3,fontFamily:"inherit",boxShadow:`0 3px 10px ${T.accent}44`}}>
              ＋ 新增支出
            </button>
            <button onClick={()=>setShowCompare(true)}
              style={{flex:1,padding:"12px 0",background:T.warmLight,color:T.warm,border:`1.5px solid ${T.warm}55`,borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              🏷️ 比價
            </button>
            <button onClick={()=>setShowQuickLedger(true)}
              style={{flex:1,padding:"12px 0",background:"#FFF3CE",color:"#B8860B",border:"2px dashed #FFD874",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              📝 隨手記
            </button>
          </div>
          <div style={{display:"flex",borderTop:`1px solid ${T.border}`,overflowX:"auto"}}>
            {[["home","明細"],["income","月收入"],["credit","信用卡"],["savings","存款"],["budget","預算"],["recurring","固定支出"],["settings","設定"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                style={{flex:"0 0 auto",padding:"11px 12px",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:tab===k?700:500,color:tab===k?T.accent:T.muted,borderBottom:tab===k?`2px solid ${T.accent}`:"2px solid transparent",transition:"all 0.15s",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT */}
        <div style={{padding:16}}>

          {/* 明細 */}
          {tab==="home" && (
            <>
              {/* 月總預算進度 */}
              {totalBudget>0 && (()=>{
                const thisMonthTotal = records.filter(r=>r.date.startsWith(today().slice(0,7))).reduce((s,r)=>s+r.amount,0);
                const remaining = totalBudget - thisMonthTotal;
                const pct = Math.min(100, Math.round((thisMonthTotal/totalBudget)*100));
                const isOver = remaining < 0;
                const isWarn = !isOver && remaining < 1000;
                return (
                  <div style={{background:isOver?"#FFF0F0":isWarn?"#FFF8EE":T.accentLight,border:`1.5px solid ${isOver?"#FFCCCC":isWarn?"#FFD4A3":T.accent+"44"}`,borderRadius:14,padding:"12px 14px",marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div style={{fontSize:12,fontWeight:700,color:isOver?"#C0392B":isWarn?"#E67E22":T.accent}}>
                        {isOver?"🚨 本月已超支":"💰 本月預算剩餘"}
                      </div>
                      <div style={{fontSize:15,fontWeight:800,color:isOver?"#C0392B":isWarn?"#E67E22":T.accent}}>
                        {isOver?`超支 ${fmt(Math.abs(remaining))}`:fmt(remaining)}
                      </div>
                    </div>
                    <div style={{height:7,background:"rgba(0,0,0,0.07)",borderRadius:6,overflow:"hidden",marginBottom:6}}>
                      <div style={{height:"100%",width:`${pct}%`,background:isOver?"#E74C3C":isWarn?"#E67E22":T.accent,borderRadius:6,transition:"width 0.4s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.muted}}>
                      <span>已花費 {fmt(thisMonthTotal)}</span>
                      <span>月預算 {fmt(totalBudget)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* 預算警示 */}
              {budgetAlerts.length>0 && (
                <div style={{background:"#FFF0F0",border:"1.5px solid #FFCCCC",borderRadius:14,padding:"10px 14px",marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#C0392B",marginBottom:6}}>⚠️ 預算警示（本月）</div>
                  {budgetAlerts.map(c=>(
                    <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:12,color:"#C0392B"}}>{c.icon} {c.label}</span>
                      <span style={{fontSize:12,fontWeight:700,color:c.remaining<0?"#C0392B":"#E67E22"}}>
                        {c.remaining<0?`超支 ${fmt(Math.abs(c.remaining))}`:`剩 ${fmt(c.remaining)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* 分類篩選列 */}
              <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:2}}>
                <button onClick={()=>setFilterCat("")}
                  style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1.5px solid ${filterCat===""?T.accent:T.border}`,background:filterCat===""?T.accent:"#fff",color:filterCat===""?"#fff":T.muted,fontSize:12,fontWeight:filterCat===""?700:500,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  全部
                </button>
                {categories.map(c=>(
                  <button key={c.id} onClick={()=>setFilterCat(filterCat===c.id?"":c.id)}
                    style={{flexShrink:0,display:"flex",alignItems:"center",gap:4,padding:"6px 12px",borderRadius:20,border:`1.5px solid ${filterCat===c.id?T.accent:T.border}`,background:filterCat===c.id?T.accentLight:"#fff",color:filterCat===c.id?T.accent:T.muted,fontSize:12,fontWeight:filterCat===c.id?700:500,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    <span>{c.icon}</span>{c.label}
                  </button>
                ))}
              </div>

              {/* 篩選結果標題 */}
              {filterCat && (()=>{
                const cat = findMain(categories, filterCat);
                const catTotal = filtered.reduce((s,r)=>s+r.amount,0);
                return cat ? (
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,padding:"8px 12px",background:T.accentLight,borderRadius:11}}>
                    <span style={{fontSize:13,fontWeight:700,color:T.accent}}>{cat.icon} {cat.label}</span>
                    <span style={{fontSize:13,fontWeight:700,color:T.accent}}>{filtered.length} 筆 · {fmt(catTotal)}</span>
                  </div>
                ) : null;
              })()}

              {filtered.length===0 && (
                <div style={{textAlign:"center",color:T.muted,padding:"48px 0",fontSize:14}}>
                  <div style={{fontSize:32,marginBottom:10}}>🌿</div>
                  {filterCat ? "這個分類本月沒有記錄" : "這個月還沒有記錄"}
                </div>
              )}
              {filtered.map(r=>{
                const main=findMain(categories,r.catMain)||{icon:"✦",label:"",img:null};
                const sub=findSub(categories,r.catMain,r.catSub);
                const pay=payMap[r.payment]||PAYMENT_METHODS[0];
                return (
                  <div key={r.id} style={cardSt}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <CatThumb item={sub||main}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,color:T.ink}}>{r.item}</div>
                        {r.note&&<div style={{fontSize:12,color:T.muted,marginTop:2}}>{r.note}</div>}
                        <div style={{fontSize:11,color:T.muted,marginTop:4,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                          <Tag color={T.tagText} bg={T.tagBg}>{main.label}{sub?` › ${sub.label}`:""}</Tag>
                          <Tag color={T.warm} bg={T.warmLight}>{pay.icon} {r.payment==="card"&&r.creditCard ? r.creditCard : pay.label}</Tag>
                          <span>{r.date}</span>
                        </div>
                      </div>
                      {/* 右側：金額 + 按鈕 */}
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                        <div style={{fontSize:17,fontWeight:700,color:T.ink}}>{fmt(r.amount)}</div>
                        <div style={{display:"flex",gap:5}}>
                          <button
                            onClick={()=>setFormState({mode:"edit",record:r})}
                            style={{fontSize:11,fontWeight:700,color:T.accent,background:T.accentLight,border:`1px solid ${T.accent}55`,borderRadius:7,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                            ✏️ 編輯
                          </button>
                          <button
                            onClick={()=>deleteDoc(doc(db,"records",r.id))}
                            style={{fontSize:11,color:T.muted,background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                            刪除
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 總計 + 匯出 */}
              <div style={{...cardSt,marginTop:4}}>
                {/* 總計列 */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom: showExport?14:0}}>
                  <div>
                    <div style={{fontSize:11,color:T.muted,fontWeight:600,letterSpacing:0.8,marginBottom:3}}>本月支出總計</div>
                    <div style={{fontSize:22,fontWeight:700,color:T.accent,letterSpacing:-0.5}}>{fmt(totalMonth)}</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>{filtered.length} 筆</div>
                  </div>
                  <button onClick={()=>{ setShowExport(v=>!v); setExportMode("all"); setExportFrom(""); setExportTo(""); }}
                    style={{padding:"11px 16px",background:showExport?T.accent:"none",color:showExport?"#fff":T.accent,border:`1.5px solid ${T.accent}`,borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                    ↓ 匯出 Excel
                  </button>
                </div>

                {/* 匯出設定展開區 */}
                {showExport && (
                  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14}}>
                    <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:10}}>選擇匯出範圍</div>

                    {/* 模式選擇 */}
                    <div style={{display:"flex",gap:8,marginBottom:14}}>
                      {[["all","全部記錄"],["range","指定月份"]].map(([v,l])=>(
                        <button key={v} onClick={()=>setExportMode(v)}
                          style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${exportMode===v?T.accent:T.border}`,background:exportMode===v?T.accentLight:"#fff",color:exportMode===v?T.accent:T.muted,fontSize:13,fontWeight:exportMode===v?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                          {l}
                        </button>
                      ))}
                    </div>

                    {/* 月份範圍選擇 */}
                    {exportMode==="range" && (
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,color:T.muted,marginBottom:4,fontWeight:600}}>從</div>
                          <select value={exportFrom} onChange={e=>setExportFrom(e.target.value)}
                            style={{width:"100%",padding:"9px 10px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:exportFrom?T.ink:T.muted,background:T.bg,fontFamily:"inherit",outline:"none"}}>
                            <option value="">選擇月份</option>
                            {monthOpts.slice().reverse().map(m=><option key={m} value={m}>{m.replace("-","年")}月</option>)}
                          </select>
                        </div>
                        <div style={{fontSize:16,color:T.muted,paddingTop:18}}>→</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,color:T.muted,marginBottom:4,fontWeight:600}}>到</div>
                          <select value={exportTo} onChange={e=>setExportTo(e.target.value)}
                            style={{width:"100%",padding:"9px 10px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:exportTo?T.ink:T.muted,background:T.bg,fontFamily:"inherit",outline:"none"}}>
                            <option value="">選擇月份</option>
                            {monthOpts.slice().reverse().map(m=><option key={m} value={m}>{m.replace("-","年")}月</option>)}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* 確認匯出按鈕 */}
                    <button onClick={()=>{
                      let exportRecords = [...records];
                      let filename = "支出記錄_全部";
                      if(exportMode==="range" && exportFrom && exportTo){
                        const from = exportFrom <= exportTo ? exportFrom : exportTo;
                        const to   = exportFrom <= exportTo ? exportTo   : exportFrom;
                        exportRecords = exportRecords.filter(r=>r.date.slice(0,7)>=from && r.date.slice(0,7)<=to);
                        filename = `支出記錄_${from.replace("-","年")}月至${to.replace("-","年")}月`;
                      } else if(exportMode==="range"){
                        return;
                      }
                      exportRecords.sort((a,b)=>b.date.localeCompare(a.date));
                      const rows = exportRecords.map(r=>({
                        "日期":r.date,"品項名稱":r.item,"說明":r.note,
                        "大分類":findMain(categories,r.catMain)?.label||"",
                        "小分類":findSub(categories,r.catMain,r.catSub)?.label||"",
                        "付款方式":payMap[r.payment]?.label||r.payment,"信用卡別":r.payment==="card"?(r.creditCard||""):"","金額 (NT$)":r.amount,
                      }));
                      const ws=XLSX.utils.json_to_sheet(rows);
                      ws["!cols"]=[{wch:12},{wch:20},{wch:26},{wch:10},{wch:10},{wch:10},{wch:14},{wch:12}];
                      const wb=XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb,ws,"支出記錄");
                      XLSX.writeFile(wb,`${filename}.xlsx`);
                      setShowExport(false);
                    }}
                      style={{width:"100%",padding:"12px 0",background:T.accent,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                        opacity:(exportMode==="range"&&(!exportFrom||!exportTo))?0.4:1}}>
                      ↓ 確認匯出
                    </button>
                    {exportMode==="range"&&(!exportFrom||!exportTo)&&(
                      <div style={{fontSize:11,color:T.muted,textAlign:"center",marginTop:8}}>請選擇起始和結束月份</div>
                    )}
                  </div>
                )}
              </div>

              {/* 底部圖片 */}
              <div style={{marginTop:8,borderRadius:16,overflow:"hidden"}}>
                {footerImg?(
                  <div style={{position:"relative"}}>
                    <img src={footerImg} alt="" style={{width:"100%",display:"block",borderRadius:16,maxHeight:300,objectFit:"cover"}}/>
                    <button onClick={removeFooterImg}
                      style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,0.45)",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      移除圖片
                    </button>
                  </div>
                ):(
                  <label style={{display:"block",cursor:"pointer"}}>
                    <div style={{border:`2px dashed ${T.border}`,borderRadius:16,padding:"30px 0",textAlign:"center",color:T.muted,fontSize:13}}>
                      <div style={{fontSize:30,marginBottom:8}}>🖼️</div>點此上傳首頁底部圖片
                    </div>
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)imgReader(f,saveFooterImg);}}/>
                  </label>
                )}
              </div>
            </>
          )}

          {/* 統計 */}
          {tab==="stats" && (
            <>
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>分類支出</div>
              {catStats.length===0&&<div style={{color:T.muted,fontSize:13,textAlign:"center",padding:"32px 0"}}>本月尚無支出</div>}
              {catStats.map(c=>(
                <div key={c.id} style={{...cardSt,padding:"12px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:7,alignItems:"center"}}>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <CatThumb item={c} size={16} box={30}/>
                      <span style={{fontSize:13,fontWeight:600,color:T.ink}}>{c.label}</span>
                    </div>
                    <span style={{fontSize:14,fontWeight:700,color:T.accent}}>{fmt(c.total)}</span>
                  </div>
                  <div style={{height:6,background:T.border,borderRadius:6,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${(c.total/maxStat)*100}%`,background:T.accent,borderRadius:6,transition:"width 0.4s ease"}}/>
                  </div>
                  <div style={{fontSize:11,color:T.muted,marginTop:5}}>佔本月 {Math.round((c.total/(totalMonth||1))*100)}%</div>
                </div>
              ))}
              <div style={{fontSize:13,fontWeight:700,color:T.ink,margin:"20px 0 12px"}}>付款方式</div>
              <div style={{display:"flex",gap:8}}>
                {payStats.map(p=>(
                  <div key={p.id} style={{...cardSt,flex:1,textAlign:"center",padding:"14px 8px"}}>
                    <div style={{fontSize:22,marginBottom:5}}>{p.icon}</div>
                    <div style={{fontSize:12,color:T.muted,marginBottom:4}}>{p.label}</div>
                    <div style={{fontSize:15,fontWeight:700,color:T.ink}}>{fmt(p.total)}</div>
                  </div>
                ))}
                {payStats.length===0&&<div style={{color:T.muted,fontSize:13}}>本月尚無資料</div>}
              </div>
            </>
          )}

          {/* 月收入 */}
          {tab==="income" && (
            <>
              {/* 月份篩選 + 新增按鈕 */}
              <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
                <select value={incomeFilterMonth} onChange={e=>setIncomeFilterMonth(e.target.value)}
                  style={{flex:1,padding:"9px 10px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.bg,fontFamily:"inherit",outline:"none"}}>
                  {[...new Set([incomeFilterMonth,...incomeRecs.map(r=>r.month||r.date?.slice(0,7)||"")])].filter(Boolean).sort((a,b)=>b.localeCompare(a)).map(m=>(
                    <option key={m} value={m}>{m.replace("-","年")}月</option>
                  ))}
                  {incomeRecs.length===0&&<option value={incomeFilterMonth}>{incomeFilterMonth.replace("-","年")}月</option>}
                </select>
                <button onClick={()=>setShowIncomeForm(v=>!v)}
                  style={{flexShrink:0,padding:"9px 16px",background:showIncomeForm?T.accent:"none",color:showIncomeForm?"#fff":T.accent,border:`1.5px solid ${T.accent}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {showIncomeForm?"✕ 取消":"＋ 新增"}
                </button>
              </div>

              {/* 新增收入表單 */}
              {showIncomeForm && (
                <div style={{...cardSt,marginBottom:14,background:T.accentLight}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>新增收入記錄</div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>日期 *</div>
                    <input type="date" value={incomeForm.date} onChange={e=>setIncomeForm(f=>({...f,date:e.target.value,month:e.target.value.slice(0,7)}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6}}>誰的收入 *</div>
                    <div style={{display:"flex",gap:8}}>
                      {INCOME_PERSONS.map(p=>(
                        <button key={p} onClick={()=>setIncomeForm(f=>({...f,person:p}))}
                          style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${incomeForm.person===p?T.accent:T.border}`,background:incomeForm.person===p?T.accentLight:"#fff",color:incomeForm.person===p?T.accent:T.muted,fontSize:13,fontWeight:incomeForm.person===p?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6}}>收入類別 *</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                      {INCOME_CATEGORIES.map(c=>(
                        <button key={c} onClick={()=>setIncomeForm(f=>({...f,category:c}))}
                          style={{padding:"7px 13px",borderRadius:10,border:`1.5px solid ${incomeForm.category===c?T.accent:T.border}`,background:incomeForm.category===c?T.accentLight:"#fff",color:incomeForm.category===c?T.accent:T.muted,fontSize:12,fontWeight:incomeForm.category===c?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>金額（NT$）*</div>
                    <input type="number" placeholder="0" value={incomeForm.amount} onChange={e=>setIncomeForm(f=>({...f,amount:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:16,fontWeight:700,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit",textAlign:"right"}}/>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>備註（選填）</div>
                    <input type="text" placeholder="備注…" value={incomeForm.note} onChange={e=>setIncomeForm(f=>({...f,note:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  </div>
                  <button onClick={addIncomeRec}
                    style={{width:"100%",padding:"11px 0",background:T.accent,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    儲存收入
                  </button>
                </div>
              )}

              {/* 收入列表 */}
              {(()=>{
                const recs = incomeRecs.filter(r=>(r.month||r.date?.slice(0,7))===incomeFilterMonth).sort((a,b)=>a.date.localeCompare(b.date));
                const totalAll  = recs.reduce((s,r)=>s+r.amount,0);
                const totalSY   = recs.filter(r=>r.person==="吳書宇").reduce((s,r)=>s+r.amount,0);
                const totalQY   = recs.filter(r=>r.person==="楊晴儀").reduce((s,r)=>s+r.amount,0);
                if(recs.length===0) return (
                  <div style={{textAlign:"center",color:T.muted,padding:"40px 0",fontSize:14}}>
                    <div style={{fontSize:28,marginBottom:8}}>💰</div>本月尚無收入記錄
                  </div>
                );
                return (
                  <>
                    {/* 總計卡片 */}
                    <div style={{...cardSt,background:"#EDF6EF",marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                        <div>
                          <div style={{fontSize:11,color:T.accent,fontWeight:700,letterSpacing:0.8,marginBottom:3}}>本月收入合計</div>
                          <div style={{fontSize:22,fontWeight:700,color:T.accent}}>{fmt(totalAll)}</div>
                        </div>
                        <div style={{fontSize:28}}>💰</div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <div style={{flex:1,background:"rgba(255,255,255,0.7)",borderRadius:10,padding:"9px 12px"}}>
                          <div style={{fontSize:11,color:T.muted,marginBottom:3}}>書宇</div>
                          <div style={{fontSize:15,fontWeight:700,color:T.accent}}>{fmt(totalSY)}</div>
                        </div>
                        <div style={{flex:1,background:"rgba(255,255,255,0.7)",borderRadius:10,padding:"9px 12px"}}>
                          <div style={{fontSize:11,color:T.muted,marginBottom:3}}>晴儀</div>
                          <div style={{fontSize:15,fontWeight:700,color:T.accent}}>{fmt(totalQY)}</div>
                        </div>
                      </div>
                    </div>

                    {/* 表格 */}
                    <div style={{background:T.card,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                      <div style={{display:"grid",gridTemplateColumns:"70px 72px 1fr 80px 28px",gap:0,background:T.accentLight,padding:"9px 12px"}}>
                        {["日期","誰","類別","金額",""].map((h,i)=>(
                          <div key={i} style={{fontSize:11,fontWeight:700,color:T.accent,textAlign:i===3?"right":"left"}}>{h}</div>
                        ))}
                      </div>
                      {recs.map((r,i)=>(
                        <div key={r.id} style={{display:"grid",gridTemplateColumns:"70px 72px 1fr 80px 28px",gap:0,padding:"10px 12px",borderBottom:i<recs.length-1?`1px solid ${T.border}`:"none",alignItems:"center"}}>
                          <div style={{fontSize:11,color:T.muted}}>{r.date}</div>
                          <div>
                            <span style={{fontSize:11,fontWeight:700,background:r.person==="吳書宇"?T.accentLight:T.warmLight,color:r.person==="吳書宇"?T.accent:T.warm,borderRadius:6,padding:"2px 6px"}}>
                              {r.person==="吳書宇"?"書宇":"晴儀"}
                            </span>
                          </div>
                          <div>
                            <div style={{fontSize:12,color:T.ink}}>{r.category}</div>
                            {r.note&&<div style={{fontSize:10,color:T.muted,marginTop:1}}>{r.note}</div>}
                          </div>
                          <div style={{fontSize:13,fontWeight:700,color:T.accent,textAlign:"right"}}>{fmt(r.amount)}</div>
                          <button onClick={()=>deleteDoc(doc(db,"incomeRecs",r.id))}
                            style={{fontSize:14,color:T.border,background:"none",border:"none",cursor:"pointer",padding:0,textAlign:"center"}}>×</button>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* 信用卡 */}
          {tab==="credit" && (
            <>
              {/* 信用卡管理 */}
              <CreditCardManager creditCards={creditCards} onSave={saveCreditCards}
                accentLight={T.accentLight} accent={T.accent} warm={T.warm} warmLight={T.warmLight}
                border={T.border} ink={T.ink} muted={T.muted} bg={T.bg} card={T.card}/>

              {/* 月份篩選 + 新增按鈕 */}
              <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
                <select value={creditFilterMonth} onChange={e=>setCreditFilterMonth(e.target.value)}
                  style={{flex:1,padding:"9px 10px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.bg,fontFamily:"inherit",outline:"none"}}>
                  {[...new Set([creditFilterMonth,...creditBills.map(b=>b.month||b.dueDate?.slice(0,7)||"")])].filter(Boolean).sort((a,b)=>b.localeCompare(a)).map(m=>(
                    <option key={m} value={m}>{m.replace("-","年")}月</option>
                  ))}
                  {creditBills.length===0&&<option value={creditFilterMonth}>{creditFilterMonth.replace("-","年")}月</option>}
                </select>
                <button onClick={()=>{ setShowCreditForm(v=>!v); setEditCreditId(null); setCreditForm({dueDate:"",card:"",amount:"",note:""}); }}
                  style={{flexShrink:0,padding:"9px 16px",background:showCreditForm?T.accent:"none",color:showCreditForm?"#fff":T.accent,border:`1.5px solid ${T.accent}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {showCreditForm?"✕ 取消":"＋ 新增"}
                </button>
              </div>

              {/* 新增信用卡帳單表單 */}
              {showCreditForm && (
                <div style={{...cardSt,marginBottom:14,background:T.accentLight}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>{editCreditId?"✏️ 編輯帳單":"新增信用卡帳單"}</div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>繳費截止日 *</div>
                    <input type="date" value={creditForm.dueDate} onChange={e=>setCreditForm(f=>({...f,dueDate:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>信用卡別 *</div>
                    <select value={creditForm.card} onChange={e=>setCreditForm(f=>({...f,card:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:creditForm.card?T.ink:T.muted,background:"#fff",outline:"none",fontFamily:"inherit"}}>
                      <option value="">請選擇信用卡</option>
                      {creditCards.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>金額 *</div>
                    <input type="number" placeholder="0" value={creditForm.amount} onChange={e=>setCreditForm(f=>({...f,amount:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:16,fontWeight:700,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit",textAlign:"right"}}/>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>備註（選填）</div>
                    <input type="text" placeholder="備注…" value={creditForm.note} onChange={e=>setCreditForm(f=>({...f,note:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  </div>
                  <button onClick={addCreditBill}
                    style={{width:"100%",padding:"11px 0",background:T.accent,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {editCreditId?"✓ 儲存修改":"儲存帳單"}
                  </button>
                </div>
              )}

              {/* 帳單列表 */}
              {(()=>{
                const bills = creditBills.filter(b=>(b.month||b.dueDate?.slice(0,7))=== creditFilterMonth).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
                const total = bills.reduce((s,b)=>s+b.amount,0);
                if(bills.length===0) return (
                  <div style={{textAlign:"center",color:T.muted,padding:"40px 0",fontSize:14}}>
                    <div style={{fontSize:28,marginBottom:8}}>💳</div>本月尚無帳單記錄
                  </div>
                );
                return (
                  <>
                    {/* 總計卡片 */}
                    <div style={{...cardSt,background:T.warmLight,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:11,color:T.warm,fontWeight:700,letterSpacing:0.8,marginBottom:3}}>本月信用卡總計</div>
                        <div style={{fontSize:22,fontWeight:700,color:T.warm}}>{fmt(total)}</div>
                        <div style={{fontSize:11,color:T.warm,marginTop:2}}>{bills.length} 張帳單</div>
                      </div>
                      <div style={{fontSize:32}}>💳</div>
                    </div>

                    {/* 帳單卡片列表 */}
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {bills.map((b)=>(
                        <div key={b.id} style={{background:T.card,borderRadius:14,padding:"13px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",border:`1px solid ${T.border}`}}>
                          <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                                <span style={{fontSize:14,fontWeight:700,color:T.ink}}>{b.card}</span>
                                <span style={{fontSize:11,background:T.warmLight,color:T.warm,borderRadius:6,padding:"2px 7px",fontWeight:600,flexShrink:0}}>{b.dueDate} 截止</span>
                              </div>
                              {b.note&&<div style={{fontSize:12,color:T.muted}}>{b.note}</div>}
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontSize:18,fontWeight:800,color:T.warm}}>{fmt(b.amount)}</div>
                            </div>
                          </div>
                          {/* 編輯 / 刪除按鈕 */}
                          <div style={{display:"flex",gap:7,marginTop:10,paddingTop:9,borderTop:`1px solid ${T.border}`}}>
                            <button onClick={()=>{
                              setCreditForm({dueDate:b.dueDate,card:b.card,amount:String(b.amount),note:b.note||""});
                              setEditCreditId(b.id);
                              setShowCreditForm(true);
                              window.scrollTo({top:0,behavior:"smooth"});
                            }}
                              style={{flex:1,padding:"7px 0",background:T.accentLight,color:T.accent,border:`1px solid ${T.accent}44`,borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                              ✏️ 編輯
                            </button>
                            <button onClick={()=>deleteDoc(doc(db,"creditBills",b.id))}
                              style={{flex:1,padding:"7px 0",background:"none",color:T.muted,border:`1px solid ${T.border}`,borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                              刪除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* 存款 */}
          {tab==="savings" && (
            <>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                <button onClick={()=>setShowSavingsForm(v=>!v)}
                  style={{padding:"9px 16px",background:showSavingsForm?T.accent:"none",color:showSavingsForm?"#fff":T.accent,border:`1.5px solid ${T.accent}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {showSavingsForm?"✕ 取消":"＋ 更新餘額"}
                </button>
              </div>

              {/* 新增/更新存款表單 */}
              {showSavingsForm && (
                <div style={{...cardSt,marginBottom:14,background:T.accentLight}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>更新帳戶餘額</div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:12,background:"#fff",borderRadius:9,padding:"8px 11px"}}>
                    💡 同一個銀行只保留最新一筆，更新後會自動覆蓋
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>填寫日期 *</div>
                    <input type="date" value={savingsForm.date} onChange={e=>setSavingsForm(f=>({...f,date:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>銀行別 *</div>
                    <select value={savingsForm.bank} onChange={e=>setSavingsForm(f=>({...f,bank:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:savingsForm.bank?T.ink:T.muted,background:"#fff",outline:"none",fontFamily:"inherit"}}>
                      <option value="">請選擇銀行</option>
                      {SAVINGS_BANKS.map(b=><option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>餘額（NT$）*</div>
                    <input type="number" placeholder="0" value={savingsForm.balance} onChange={e=>setSavingsForm(f=>({...f,balance:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:16,fontWeight:700,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit",textAlign:"right"}}/>
                  </div>
                  <button onClick={addSavingsRec}
                    style={{width:"100%",padding:"11px 0",background:T.accent,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    儲存餘額
                  </button>
                </div>
              )}

              {/* 存款列表 */}
              {(()=>{
                const total = savingsRecs.reduce((s,r)=>s+r.balance,0);
                if(savingsRecs.length===0) return (
                  <div style={{textAlign:"center",color:T.muted,padding:"40px 0",fontSize:14}}>
                    <div style={{fontSize:28,marginBottom:8}}>🏦</div>尚未輸入任何帳戶餘額
                  </div>
                );
                const sorted = [...savingsRecs].sort((a,b)=>a.bank.localeCompare(b.bank));
                return (
                  <>
                    {/* 總計卡片 */}
                    <div style={{...cardSt,background:"#EDF6EF",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:11,color:T.accent,fontWeight:700,letterSpacing:0.8,marginBottom:3}}>活期存款合計</div>
                        <div style={{fontSize:22,fontWeight:700,color:T.accent}}>{fmt(total)}</div>
                        <div style={{fontSize:11,color:T.accent,marginTop:2}}>{savingsRecs.length} 個帳戶</div>
                      </div>
                      <div style={{fontSize:32}}>🏦</div>
                    </div>

                    {/* 表格 */}
                    <div style={{background:T.card,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                      {/* 表頭 */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 100px 80px 32px",gap:0,background:T.accentLight,padding:"9px 12px"}}>
                        {["銀行別","更新日期","餘額",""].map((h,i)=>(
                          <div key={i} style={{fontSize:11,fontWeight:700,color:T.accent,textAlign:i===2?"right":"left"}}>{h}</div>
                        ))}
                      </div>
                      {/* 資料列 */}
                      {sorted.map((r,i)=>(
                        <div key={r.id} style={{display:"grid",gridTemplateColumns:"1fr 100px 80px 32px",gap:0,padding:"11px 12px",borderBottom:i<sorted.length-1?`1px solid ${T.border}`:"none",alignItems:"center"}}>
                          <div style={{fontSize:13,fontWeight:600,color:T.ink}}>{r.bank}</div>
                          <div style={{fontSize:11,color:T.muted}}>{r.date||r.updatedAt}</div>
                          <div style={{fontSize:14,fontWeight:700,color:T.accent,textAlign:"right"}}>{fmt(r.balance)}</div>
                          <button onClick={()=>deleteDoc(doc(db,"savingsRecs",r.id))}
                            style={{fontSize:14,color:T.border,background:"none",border:"none",cursor:"pointer",padding:0,textAlign:"center"}}>×</button>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* 預算 */}
          {tab==="budget" && (
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink}}>預算設定</div>
                <button onClick={()=>{ setBudgetDraft({...budgets}); setTotalBudgetDraft(totalBudget?String(totalBudget):""); setShowBudgetForm(v=>!v); }}
                  style={{padding:"8px 16px",background:showBudgetForm?T.accent:"none",color:showBudgetForm?"#fff":T.accent,border:`1.5px solid ${T.accent}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {showBudgetForm?"✕ 取消":"✏️ 編輯預算"}
                </button>
              </div>

              {showBudgetForm && (
                <div style={{...cardSt,background:T.accentLight,marginBottom:14}}>
                  {/* 月總預算 */}
                  <div style={{marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
                    <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:8}}>📌 月總支出預算</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="number" placeholder="不設定" value={totalBudgetDraft}
                        onChange={e=>setTotalBudgetDraft(e.target.value)}
                        style={{flex:1,padding:"10px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:18,fontWeight:700,color:T.ink,background:"#fff",outline:"none",textAlign:"right",fontFamily:"inherit"}}/>
                      <span style={{fontSize:12,color:T.muted,flexShrink:0}}>元／月</span>
                    </div>
                    <div style={{fontSize:11,color:T.muted,marginTop:5}}>設定後首頁會顯示本月花費進度</div>
                  </div>
                  {/* 分類預算 */}
                  <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:8}}>📂 各分類預算</div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:10}}>空白表示該分類不設上限</div>
                  {categories.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,width:80,flexShrink:0}}>
                        <span style={{fontSize:16}}>{c.icon}</span>
                        <span style={{fontSize:12,color:T.ink,fontWeight:600}}>{c.label}</span>
                      </div>
                      <input type="number" placeholder="不設定" value={budgetDraft[c.id]||""}
                        onChange={e=>setBudgetDraft(d=>({...d,[c.id]:e.target.value}))}
                        style={{flex:1,padding:"8px 10px",borderRadius:9,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",textAlign:"right",fontFamily:"inherit"}}/>
                      <span style={{fontSize:11,color:T.muted,flexShrink:0}}>元</span>
                    </div>
                  ))}
                  <button onClick={async()=>{
                    const clean={};
                    Object.entries(budgetDraft).forEach(([k,v])=>{ if(v&&toMoney(v)>0) clean[k]=toMoney(v); });
                    await saveBudgets(clean, totalBudgetDraft);
                    setShowBudgetForm(false);
                  }} style={{width:"100%",padding:"11px 0",background:T.accent,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
                    儲存預算
                  </button>
                </div>
              )}

              {/* 月總預算卡片 */}
              {totalBudget>0 && !showBudgetForm && (()=>{
                const thisMonthTotal = records.filter(r=>r.date.startsWith(filterMonth)).reduce((s,r)=>s+r.amount,0);
                const remaining = totalBudget - thisMonthTotal;
                const pct = Math.min(100, Math.round((thisMonthTotal/totalBudget)*100));
                const isOver = remaining < 0;
                const isWarn = !isOver && remaining < 1000;
                return (
                  <div style={{...cardSt,background:isOver?"#FFF0F0":isWarn?"#FFF8EE":"#EDF6EF",marginBottom:14,border:`1.5px solid ${isOver?"#FFCCCC":isWarn?"#FFD4A3":T.accent+"55"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontSize:11,color:T.muted,fontWeight:600,marginBottom:3}}>月總預算剩餘</div>
                        <div style={{fontSize:22,fontWeight:700,color:isOver?"#C0392B":isWarn?"#E67E22":T.accent}}>
                          {isOver?`超支 ${fmt(Math.abs(remaining))}`:fmt(remaining)}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:11,color:T.muted,fontWeight:600,marginBottom:3}}>已花費</div>
                        <div style={{fontSize:18,fontWeight:700,color:T.ink}}>{fmt(thisMonthTotal)}</div>
                      </div>
                    </div>
                    <div style={{height:8,background:"rgba(0,0,0,0.07)",borderRadius:6,overflow:"hidden",marginBottom:5}}>
                      <div style={{height:"100%",width:`${pct}%`,background:isOver?"#E74C3C":isWarn?"#E67E22":T.accent,borderRadius:6,transition:"width 0.4s"}}/>
                    </div>
                    <div style={{fontSize:11,color:T.muted,textAlign:"right"}}>月預算 {fmt(totalBudget)}（{pct}%）</div>
                  </div>
                );
              })()}

              {/* 預算執行狀況 */}
              {categories.filter(c=>budgets[c.id]>0).length===0 ? (
                <div style={{textAlign:"center",color:T.muted,padding:"40px 0",fontSize:14}}>
                  <div style={{fontSize:28,marginBottom:8}}>📊</div>尚未設定任何預算<br/>點上方「編輯預算」開始設定
                </div>
              ) : (
                categories.filter(c=>budgets[c.id]>0).map(c=>{
                  const budget    = +budgets[c.id];
                  const spent     = records.filter(r=>r.date.startsWith(filterMonth)&&r.catMain===c.id).reduce((s,r)=>s+r.amount,0);
                  const remaining = budget - spent;
                  const pct       = Math.min(100, Math.round((spent/budget)*100));
                  const isWarn    = remaining < 1000;
                  const isOver    = remaining < 0;
                  return (
                    <div key={c.id} style={{...cardSt,border:isWarn?`1.5px solid ${isOver?"#FFAAAA":"#FFD4A3"}`:"1.5px solid transparent"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          <CatThumb item={c} size={16} box={30}/>
                          <span style={{fontSize:13,fontWeight:600,color:T.ink}}>{c.label}</span>
                          {isOver&&<span style={{fontSize:10,background:"#FFE0E0",color:"#C0392B",borderRadius:5,padding:"1px 6px",fontWeight:700}}>超支</span>}
                          {!isOver&&isWarn&&<span style={{fontSize:10,background:"#FFF0D0",color:"#E67E22",borderRadius:5,padding:"1px 6px",fontWeight:700}}>快超支</span>}
                        </div>
                        <span style={{fontSize:12,color:isOver?"#C0392B":isWarn?"#E67E22":T.muted}}>
                          剩 {fmt(remaining)}
                        </span>
                      </div>
                      <div style={{height:7,background:T.border,borderRadius:6,overflow:"hidden",marginBottom:6}}>
                        <div style={{height:"100%",width:`${pct}%`,background:isOver?"#E74C3C":isWarn?"#E67E22":T.accent,borderRadius:6,transition:"width 0.4s ease"}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.muted}}>
                        <span>已花 {fmt(spent)}</span>
                        <span>預算 {fmt(budget)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* 固定支出 */}
          {tab==="recurring" && (
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>固定支出項目</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:2}}>每月到日期自動新增</div>
                </div>
                <button onClick={()=>setShowRecurForm(v=>!v)}
                  style={{padding:"9px 16px",background:showRecurForm?T.accent:"none",color:showRecurForm?"#fff":T.accent,border:`1.5px solid ${T.accent}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {showRecurForm?"✕ 取消":"＋ 新增"}
                </button>
              </div>

              {showRecurForm && (
                <div style={{...cardSt,background:T.accentLight,marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>新增固定支出</div>

                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>每月幾號自動新增 *</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28].map(d=>(
                        <button key={d} onClick={()=>setRecurForm(f=>({...f,day:String(d)}))}
                          style={{width:36,height:36,borderRadius:9,border:`1.5px solid ${recurForm.day===String(d)?T.accent:T.border}`,background:recurForm.day===String(d)?T.accentLight:"#fff",color:recurForm.day===String(d)?T.accent:T.muted,fontSize:13,fontWeight:recurForm.day===String(d)?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>品項名稱 *</div>
                    <input type="text" placeholder="例：Netflix" value={recurForm.item} onChange={e=>setRecurForm(f=>({...f,item:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  </div>

                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6}}>大分類 *</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {categories.map(c=>(
                        <button key={c.id} onClick={()=>setRecurForm(f=>({...f,catMain:c.id,catSub:""}))}
                          style={{padding:"6px 11px",borderRadius:9,border:`1.5px solid ${recurForm.catMain===c.id?T.accent:T.border}`,background:recurForm.catMain===c.id?T.accentLight:"#fff",color:recurForm.catMain===c.id?T.accent:T.muted,fontSize:12,fontWeight:recurForm.catMain===c.id?700:500,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
                          <span>{c.icon}</span>{c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {recurForm.catMain && findMain(categories,recurForm.catMain)?.sub?.length>0 && (
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6}}>小分類</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {findMain(categories,recurForm.catMain).sub.map(s=>(
                          <button key={s.id} onClick={()=>setRecurForm(f=>({...f,catSub:s.id}))}
                            style={{padding:"5px 10px",borderRadius:9,border:`1.5px solid ${recurForm.catSub===s.id?T.accent:T.border}`,background:recurForm.catSub===s.id?T.accentLight:"#EDE8E1",color:recurForm.catSub===s.id?T.accent:T.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                            {s.icon} {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6}}>付款方式 *</div>
                    <div style={{display:"flex",gap:8}}>
                      {PAYMENT_METHODS.map(p=>(
                        <button key={p.id} onClick={()=>setRecurForm(f=>({...f,payment:p.id,creditCard:""}))}
                          style={{flex:1,padding:"8px 0",borderRadius:9,border:`1.5px solid ${recurForm.payment===p.id?T.warm:T.border}`,background:recurForm.payment===p.id?T.warmLight:"#fff",color:recurForm.payment===p.id?T.warm:T.muted,fontSize:12,fontWeight:recurForm.payment===p.id?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                          {p.icon} {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {recurForm.payment==="card" && (
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6}}>信用卡別 *</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {creditCards.map(c=>(
                          <button key={c} onClick={()=>setRecurForm(f=>({...f,creditCard:c}))}
                            style={{padding:"5px 10px",borderRadius:9,border:`1.5px solid ${recurForm.creditCard===c?T.warm:T.border}`,background:recurForm.creditCard===c?T.warmLight:"#fff",color:recurForm.creditCard===c?T.warm:T.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>金額（NT$）*</div>
                    <input type="number" placeholder="0" value={recurForm.amount} onChange={e=>setRecurForm(f=>({...f,amount:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:16,fontWeight:700,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit",textAlign:"right"}}/>
                  </div>

                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>備註（選填）</div>
                    <input type="text" placeholder="備注…" value={recurForm.note} onChange={e=>setRecurForm(f=>({...f,note:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  </div>

                  <button onClick={addRecurringItem}
                    style={{width:"100%",padding:"11px 0",background:T.accent,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    新增固定支出
                  </button>
                </div>
              )}

              {/* 固定支出列表 */}
              {recurringItems.length===0 ? (
                <div style={{textAlign:"center",color:T.muted,padding:"40px 0",fontSize:14}}>
                  <div style={{fontSize:28,marginBottom:8}}>🔄</div>尚未設定固定支出項目
                </div>
              ) : (
                <div style={{background:T.card,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                  {recurringItems.sort((a,b)=>+a.day-+b.day).map((item,i)=>{
                    const cat=findMain(categories,item.catMain)||{icon:"✦",label:""};
                    const pay=PAYMENT_METHODS.find(p=>p.id===item.payment)||PAYMENT_METHODS[0];
                    return (
                      <div key={item.id} style={{padding:"12px 14px",borderBottom:i<recurringItems.length-1?`1px solid ${T.border}`:"none",display:"flex",alignItems:"flex-start",gap:10}}>
                        <div style={{width:36,height:36,borderRadius:10,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:12,fontWeight:700,color:T.accent}}>{item.day}日</span>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:600,color:T.ink}}>{item.item}</div>
                          <div style={{fontSize:11,color:T.muted,marginTop:3,display:"flex",gap:5,flexWrap:"wrap"}}>
                            <Tag color={T.tagText} bg={T.tagBg}>{cat.icon} {cat.label}</Tag>
                            <Tag color={T.warm} bg={T.warmLight}>{pay.icon} {item.payment==="card"&&item.creditCard?item.creditCard:pay.label}</Tag>
                          </div>
                          {item.note&&<div style={{fontSize:11,color:T.muted,marginTop:3}}>{item.note}</div>}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                          <div style={{fontSize:15,fontWeight:700,color:T.ink}}>{fmt(item.amount)}</div>
                          <button onClick={()=>deleteDoc(doc(db,"recurringItems",item.id))}
                            style={{fontSize:11,color:T.muted,background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"3px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                            刪除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* 設定 */}
          {/* 比價 */}
          {/* 比價 Modal */}
          {showCompare && <CompareModal
            compareItems={compareItems} comparePrices={comparePrices}
            compareView={compareView} setCompareView={setCompareView}
            showItemForm={showItemForm} setShowItemForm={setShowItemForm}
            showPriceForm={showPriceForm} setShowPriceForm={setShowPriceForm}
            itemFormName={itemFormName} setItemFormName={setItemFormName}
            itemFormUnit={itemFormUnit} setItemFormUnit={setItemFormUnit}
            priceForm={priceForm} setPriceForm={setPriceForm}
            editItemId={editItemId} setEditItemId={setEditItemId}
            addCompareItem={addCompareItem} addComparePrice={addComparePrice}
            onClose={()=>{ setShowCompare(false); setCompareView(null); setShowItemForm(false); setShowPriceForm(false); }}
            db={db} T={T} cardSt={cardSt} fmt={fmt}
          />}

          {tab==="settings" && (
            <SettingsTab categories={categories} onSaveCategories={saveCategories} calcIcon={calcIcon} setCalcIcon={setCalcIcon}/>
          )}
        </div>
      </div>

      {/* 表單 Modal */}
      {formState && (
        <RecordForm
          isEdit={formState.mode==="edit"}
          initialForm={formState.mode==="edit" ? formState.record : {date:today()}}
          categories={categories}
          calcIcon={calcIcon}
          creditCards={creditCards}
          onSubmit={formState.mode==="edit" ? handleEdit : handleAdd}
          onClose={()=>setFormState(null)}
        />
      )}

      {/* 凌亂記錄 Modal */}
      {showQuickLedger && (
        <div style={{position:"fixed",inset:0,zIndex:1300,overflowY:"auto",
          background:"radial-gradient(circle at 1px 1px,#EFE4D2 1.5px,transparent 1.5px) 0 0/22px 22px, #FFF8EC",
          fontFamily:"'Nunito','Noto Sans TC',sans-serif"}}>
          <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet"/>

          {/* 頂部標題列 */}
          <div style={{background:"rgba(255,248,236,0.92)",backdropFilter:"blur(8px)",padding:"16px 18px 12px",position:"sticky",top:0,zIndex:10,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px dashed #EAE0D1"}}>
            <div>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontWeight:800,fontSize:22,color:"#4A3B32",letterSpacing:0.5}}>
                📝 隨手記
              </div>
              <div style={{fontSize:11,color:"#8A7A6D",fontWeight:600,marginTop:1}}>快速記下，之後再整理</div>
            </div>
            <button onClick={()=>setShowQuickLedger(false)}
              style={{background:"rgba(255,107,149,0.12)",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:800,color:"#FF6B95",cursor:"pointer",fontFamily:"inherit"}}>
              ✕ 關閉
            </button>
          </div>

          {/* 輸入區 */}
          <div style={{maxWidth:420,margin:"18px auto 0",padding:"0 16px"}}>
            <div style={{background:"#FFFDF7",borderRadius:22,padding:"20px 18px 16px",boxShadow:"0 10px 24px rgba(74,59,50,0.12)",border:"2px dashed #EAE0D1",position:"relative"}}>
              <div style={{position:"absolute",top:-14,left:18,fontSize:22,background:"#FFF8EC",padding:"2px 8px",borderRadius:"50%"}}>✏️</div>
              
              <div style={{marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:800,color:"#8A7A6D",marginBottom:5,letterSpacing:0.3}}>品項名稱</div>
                <input value={quickForm.name} onChange={e=>setQuickForm(f=>({...f,name:e.target.value}))}
                  onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); addQuickEntry(); } }}
                  placeholder="買了什麼？"
                  style={{width:"100%",border:"2px solid #EAE0D1",borderRadius:14,padding:"10px 12px",fontFamily:"'Nunito',sans-serif",fontSize:15,fontWeight:600,color:"#4A3B32",background:"#fff",outline:"none",boxSizing:"border-box"}}/>
              </div>

              <div style={{marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:800,color:"#8A7A6D",marginBottom:5}}>金額</div>
                <div style={{display:"flex",gap:8}}>
                  <input type="number" value={quickForm.amount} onChange={e=>setQuickForm(f=>({...f,amount:e.target.value}))}
                    onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); addQuickEntry(); } }}
                    placeholder="0"
                    style={{flex:1,border:"2px solid #EAE0D1",borderRadius:14,padding:"10px 12px",fontFamily:"'Baloo 2',sans-serif",fontSize:19,fontWeight:700,color:"#4A3B32",background:"#fff",outline:"none",textAlign:"right"}}/>
                  <button onClick={()=>setQuickCalcOpen(true)}
                    style={{flexShrink:0,width:46,border:"2px solid #EAE0D1",borderRadius:14,background:"#C6B4FF",fontSize:20,cursor:"pointer",transition:"transform 0.12s"}}>
                    🧮
                  </button>
                </div>
              </div>

              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:800,color:"#8A7A6D",marginBottom:5}}>備註（選填）</div>
                <textarea value={quickForm.note} onChange={e=>setQuickForm(f=>({...f,note:e.target.value}))}
                  placeholder="補充說明…" rows={2}
                  style={{width:"100%",border:"2px solid #EAE0D1",borderRadius:14,padding:"10px 12px",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:600,color:"#4A3B32",background:"#fff",outline:"none",resize:"none",boxSizing:"border-box"}}/>
              </div>

              <button onClick={addQuickEntry} disabled={quickSaving}
                style={{width:"100%",padding:13,border:"none",borderRadius:16,background:"linear-gradient(135deg,#FF8FAB,#FF6B95)",color:"#fff",fontFamily:"'Baloo 2',sans-serif",fontWeight:700,fontSize:17,cursor:"pointer",boxShadow:"0 6px 14px rgba(255,107,149,0.35)",opacity:quickSaving?0.7:1}}>
                {quickSaving?"儲存中…":"＋ 記下這筆"}
              </button>
            </div>

            {/* 統計列 */}
            {quickEntries.filter(e=>!e.done).length>0 && (
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 4px",fontSize:13,fontWeight:800,color:"#8A7A6D",maxWidth:420,margin:"0 auto"}}>
                <span>待整理 <span style={{color:"#FF6B95",fontFamily:"'Baloo 2',sans-serif",fontSize:15}}>{quickEntries.filter(e=>!e.done).length}</span> 筆</span>
                <span>合計 <span style={{color:"#FF6B95",fontFamily:"'Baloo 2',sans-serif",fontSize:15}}>${quickEntries.filter(e=>!e.done).reduce((s,e)=>s+(Number(e.amount)||0),0).toLocaleString()}</span></span>
              </div>
            )}

            {/* 卡片牆 */}
            <div style={{paddingBottom:40}}>
              {quickEntries.length===0 && (
                <div style={{textAlign:"center",color:"#8A7A6D",fontWeight:700,padding:"40px 20px",fontSize:15}}>
                  <span style={{fontSize:44,display:"block",marginBottom:8}}>🗒️</span>
                  還沒有記錄，快記一筆！
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"16px 14px",marginTop:8}}>
                {[...quickEntries].sort((a,b)=>{
                  if(!!a.done!==!!b.done) return a.done?1:-1;
                  return (b.createdAt||0)-(a.createdAt||0);
                }).map((entry,idx)=>{
                  const col=QUICK_COLORS[idx%5];
                  const rot=hashRotate(entry.id);
                  return (
                    <div key={entry.id}
                      style={{background:col.bg,borderRadius:14,padding:"16px 14px 12px",position:"relative",boxShadow:"0 6px 14px rgba(74,59,50,0.14)",transform:`rotate(${rot}deg)`,opacity:entry.done?0.55:1,display:"flex",flexDirection:"column",minHeight:100}}>
                      {/* 圖釘 */}
                      <div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)",width:16,height:16,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%,#fff,${col.pin} 60%)`,boxShadow:"0 2px 4px rgba(0,0,0,0.25)"}}/>

                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                        <div style={{fontFamily:"'Baloo 2',sans-serif",fontWeight:700,fontSize:15,lineHeight:1.25,wordBreak:"break-word",textDecoration:entry.done?"line-through":"none",color:"#4A3B32"}}>
                          {entry.name||"未命名"}
                        </div>
                      </div>

                      <div style={{fontFamily:"'Baloo 2',sans-serif",fontWeight:800,fontSize:20,margin:"5px 0 3px",textDecoration:entry.done?"line-through":"none",color:"#4A3B32"}}>
                        ${Number(entry.amount||0).toLocaleString()}
                      </div>

                      {entry.note&&(
                        <div style={{fontSize:12,color:"#8A7A6D",fontWeight:600,lineHeight:1.4,flex:1,wordBreak:"break-word"}}>{entry.note}</div>
                      )}

                      <div style={{fontSize:11,color:"#8A7A6D",fontWeight:700,marginTop:7,opacity:0.8}}>
                        {entry.createdAt?fmtQuickTime(entry.createdAt):""}
                      </div>

                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                        <label style={{display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:800,color:"#8A7A6D",cursor:"pointer",userSelect:"none"}}>
                          <input type="checkbox" checked={!!entry.done}
                            onChange={e=>toggleQuickDone(entry.id,e.target.checked)}
                            style={{width:15,height:15,cursor:"pointer",accentColor:"#4FCBAE"}}/>
                          已登記
                        </label>
                        <button onClick={()=>deleteDoc(doc(db,"quickLedgerEntries",entry.id))}
                          style={{border:"none",background:"rgba(255,255,255,0.6)",width:26,height:26,borderRadius:"50%",fontSize:13,cursor:"pointer",color:"#8A7A6D",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 計算機 */}
          {quickCalcOpen && (
            <Calculator
              initial={quickForm.amount}
              calcIcon={calcIcon}
              onConfirm={v=>{ setQuickForm(f=>({...f,amount:String(v)})); setQuickCalcOpen(false); }}
              onClose={()=>setQuickCalcOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
