import React, { useState, useEffect, useMemo } from "react";
import { db } from './firebase.js';
import { doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

import {
  LayoutDashboard, Package, ShoppingCart, Wallet, BarChart3, Plus, Trash2,
  Pencil, X, Search, Settings, AlertTriangle, Loader2, ClipboardList,
  Receipt, Users, CheckCircle2, ChevronDown, ChevronUp
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend
} from "recharts";

const COL = "crm"; // colección de Firestore
const LOW_STOCK = 3;
const CATEGORY_SUGGESTIONS = ["Remeras", "Pantalones", "Vestidos", "Camisas", "Buzos / Abrigos", "Accesorios"];
const TALLE_SUGGESTIONS = ["XS", "S", "M", "L", "XL", "Único", "36", "38", "40", "42"];
const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Cuenta corriente", "Otro"];
const SETTLE_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Otro"];
const INCOME_CATS = ["Otro ingreso", "Devolución de proveedor", "Aporte de capital"];
const EXPENSE_CATS = ["Alquiler", "Insumos", "Sueldos", "Impuestos", "Servicios", "Otro"];
const PIE_COLORS = ["#2F5D62", "#C97A2B", "#3F7D58", "#B23A48", "#767D87", "#8B5E3C", "#4F6D7A"];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function parseD(s) { return new Date(s + "T00:00:00"); }
function fmtShort(s) { try { return parseD(s).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }); } catch { return s; } }
function fmtFull(s) { try { return parseD(s).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return s; } }
function money(n) { return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0); }
function isInCurrentMonth(s) { const d = parseD(s), now = new Date(); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
function startOfWeek(date) { const d = new Date(date); const day = d.getDay(); const diff = (day === 0 ? -6 : 1) - day; d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0); return d; }

// storage: Firebase Firestore (ver firebase.js)

/* ── Componentes pequeños ── */
function Badge({ tone = "neutral", children }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
function StockBadge({ stock }) {
  if (stock <= 0) return <Badge tone="negative">Sin stock</Badge>;
  if (stock <= LOW_STOCK) return <Badge tone="warning">Stock bajo</Badge>;
  return <Badge tone="positive">Disponible</Badge>;
}
function EmptyState({ icon: Icon, title, hint, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={22} /></div>
      <p className="empty-title">{title}</p>
      <p className="empty-hint">{hint}</p>
      {actionLabel && <button className="btn btn-primary" onClick={onAction}><Plus size={15} /> {actionLabel}</button>}
    </div>
  );
}
function Modal({ title, onClose, children, width }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={17} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children, error }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
function KpiCard({ label, value, sub, tone }) {
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${tone ? "tone-" + tone : ""}`}>{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

/* ── App principal ── */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]); // [{id,customerName,entries:[{id,type,amount,date,note,paymentMethod}]}]
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [stockSearch, setStockSearch] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [financeFilter, setFinanceFilter] = useState("todos");
  const [reportRange, setReportRange] = useState("month");
  const [recSearch, setRecSearch] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [expandedAcc, setExpandedAcc] = useState(null);
  const [productForm, setProductForm] = useState(null);
  const [saleForm, setSaleForm] = useState(null);
  const [txForm, setTxForm] = useState(null);
  const [accForm, setAccForm] = useState(null);       // nueva cuenta manual
  const [chargeForm, setChargeForm] = useState(null); // cargo manual a cuenta
  const [payForm, setPayForm] = useState(null);       // pago parcial/total
  const [formError, setFormError] = useState("");

  useEffect(() => {
    // Escucha en tiempo real: cualquier cambio en Firebase actualiza la pantalla de todos
    const unsubs = [];
    const listen = (key, setter) => {
      const ref = doc(db, COL, key);
      return onSnapshot(ref, (snap) => {
        setter(snap.exists() ? snap.data().items : []);
      });
    };
    unsubs.push(listen("products",    setProducts));
    unsubs.push(listen("sales",       setSales));
    unsubs.push(listen("transactions",setTransactions));
    unsubs.push(listen("accounts",    setAccounts));
    setLoading(false);
    return () => unsubs.forEach(u => u());
  }, []);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2600); }
  function updateProducts(n)     { setProducts(n);     setDoc(doc(db,COL,"products"),    {items:n}); }
  function updateSales(n)        { setSales(n);        setDoc(doc(db,COL,"sales"),       {items:n}); }
  function updateTransactions(n) { setTransactions(n); setDoc(doc(db,COL,"transactions"),{items:n}); }
  function updateAccounts(n)     { setAccounts(n);     setDoc(doc(db,COL,"accounts"),    {items:n}); }

  async function resetAllData() {
    await Promise.all(["products","sales","transactions","accounts"].map(k =>
      setDoc(doc(db,COL,k), {items:[]})
    ));
    setModal(null); showToast("Datos reiniciados");
  }

  /* ── Productos ── */
  function openAddProduct() { setProductForm({ name:"",category:"",talle:"",color:"",sku:"",price:"",cost:"",stock:"" }); setFormError(""); setModal({type:"product",editingId:null}); }
  function openEditProduct(p) { setProductForm({name:p.name,category:p.category,talle:p.talle,color:p.color,sku:p.sku,price:String(p.price),cost:String(p.cost),stock:String(p.stock)}); setFormError(""); setModal({type:"product",editingId:p.id}); }
  function submitProduct() {
    const f = productForm;
    if (!f.name.trim()) return setFormError("El nombre es obligatorio.");
    const price = parseFloat(f.price), cost = parseFloat(f.cost||"0"), stock = parseInt(f.stock||"0",10);
    if (isNaN(price)||price<0) return setFormError("Ingresá un precio de venta válido.");
    if (isNaN(stock)||stock<0) return setFormError("Ingresá una cantidad de stock válida.");
    const sku = f.sku.trim()||(f.name.slice(0,3)+(f.talle||"U").slice(0,2)+uid().slice(-3)).toUpperCase();
    if (modal.editingId) {
      updateProducts(products.map(p=>p.id===modal.editingId?{...p,name:f.name.trim(),category:f.category.trim()||"Sin categoría",talle:f.talle.trim()||"Único",color:f.color.trim(),sku,price,cost:isNaN(cost)?0:cost,stock}:p));
      showToast("Producto actualizado");
    } else {
      updateProducts([...products,{id:uid(),name:f.name.trim(),category:f.category.trim()||"Sin categoría",talle:f.talle.trim()||"Único",color:f.color.trim(),sku,price,cost:isNaN(cost)?0:cost,stock,createdAt:Date.now()}]);
      showToast("Producto agregado");
    }
    setModal(null);
  }
  function deleteProduct(id) { updateProducts(products.filter(p=>p.id!==id)); setModal(null); showToast("Producto eliminado"); }

  /* ── Ventas ── */
  function openAddSale() {
    if (!products.length) { showToast("Primero agregá un producto en Stock"); return; }
    setSaleForm({productId:"",quantity:"1",unitPrice:"",date:todayStr(),customer:"",paymentMethod:PAYMENT_METHODS[0]});
    setFormError(""); setModal({type:"sale"});
  }
  function onSaleProductChange(productId) {
    const prod = products.find(p=>p.id===productId);
    setSaleForm({...saleForm,productId,unitPrice:prod?String(prod.price):""});
  }
  function submitSale() {
    const f = saleForm;
    const prod = products.find(p=>p.id===f.productId);
    if (!prod) return setFormError("Seleccioná un producto.");
    const qty = parseInt(f.quantity,10), unitPrice = parseFloat(f.unitPrice);
    if (isNaN(qty)||qty<=0) return setFormError("La cantidad debe ser mayor a 0.");
    if (qty>prod.stock) return setFormError(`Solo hay ${prod.stock} unidades en stock.`);
    if (isNaN(unitPrice)||unitPrice<0) return setFormError("Ingresá un precio válido.");
    if (!f.date) return setFormError("Ingresá una fecha.");
    const total = qty*unitPrice;
    const sale = {id:uid(),productId:prod.id,productName:prod.name,category:prod.category,talle:prod.talle,color:prod.color,quantity:qty,unitPrice,total,date:f.date,customer:f.customer.trim(),paymentMethod:f.paymentMethod,createdAt:Date.now()};
    updateSales([sale,...sales]);
    updateProducts(products.map(p=>p.id===prod.id?{...p,stock:p.stock-qty}:p));
    // Si es cuenta corriente → crear o actualizar cuenta del cliente
    if (f.paymentMethod==="Cuenta corriente") {
      const customerName = f.customer.trim()||"Cliente sin nombre";
      const entry = {id:uid(),type:"cargo",amount:total,date:f.date,note:`Venta: ${prod.name} x${qty}`,paymentMethod:"Cuenta corriente",saleId:sale.id,createdAt:Date.now()};
      const existing = accounts.find(a=>a.customerName.toLowerCase()===customerName.toLowerCase());
      if (existing) {
        updateAccounts(accounts.map(a=>a.id===existing.id?{...a,entries:[entry,...a.entries]}:a));
      } else {
        updateAccounts([...accounts,{id:uid(),customerName,createdAt:Date.now(),entries:[entry]}]);
      }
    }
    setModal(null); showToast("Venta registrada");
  }
  function deleteSale(id) {
    const sale = sales.find(s=>s.id===id);
    if (sale) {
      const prod = products.find(p=>p.id===sale.productId);
      if (prod) updateProducts(products.map(p=>p.id===prod.id?{...p,stock:p.stock+sale.quantity}:p));
      // Si era cuenta corriente, eliminar el cargo de la cuenta
      if (sale.paymentMethod==="Cuenta corriente") {
        updateAccounts(accounts.map(a=>({...a,entries:a.entries.filter(e=>e.saleId!==id)})));
      }
    }
    updateSales(sales.filter(s=>s.id!==id));
    setModal(null); showToast("Venta eliminada y stock repuesto");
  }

  /* ── Ingresos / Egresos ── */
  function openAddTx() { setTxForm({type:"ingreso",category:INCOME_CATS[0],description:"",amount:"",date:todayStr()}); setFormError(""); setModal({type:"tx"}); }
  function submitTx() {
    const f = txForm, amount = parseFloat(f.amount);
    if (isNaN(amount)||amount<=0) return setFormError("Ingresá un monto válido.");
    if (!f.date) return setFormError("Ingresá una fecha.");
    updateTransactions([{id:uid(),type:f.type,category:f.category,description:f.description.trim(),amount,date:f.date,createdAt:Date.now()},...transactions]);
    setModal(null); showToast("Movimiento registrado");
  }
  function deleteTx(id) { updateTransactions(transactions.filter(t=>t.id!==id)); setModal(null); showToast("Movimiento eliminado"); }

  /* ── Cuentas por cobrar ── */
  // Helpers derivados por cuenta
  function accBalance(acc) {
    return acc.entries.reduce((sum,e)=>e.type==="cargo"?sum+e.amount:sum-e.amount,0);
  }
  function accPaid(acc) { return acc.entries.filter(e=>e.type==="pago").reduce((s,e)=>s+e.amount,0); }
  function accTotal(acc) { return acc.entries.filter(e=>e.type==="cargo").reduce((s,e)=>s+e.amount,0); }

  function openAddAccount() {
    setAccForm({customerName:""});
    setFormError(""); setModal({type:"account"});
  }
  function submitAccount() {
    const name = accForm.customerName.trim();
    if (!name) return setFormError("El nombre del cliente es obligatorio.");
    if (accounts.find(a=>a.customerName.toLowerCase()===name.toLowerCase())) return setFormError("Ya existe una cuenta con ese nombre.");
    updateAccounts([...accounts,{id:uid(),customerName:name,createdAt:Date.now(),entries:[]}]);
    setModal(null); showToast("Cuenta creada");
  }

  function openAddCharge(accId) {
    setChargeForm({accId,amount:"",date:todayStr(),note:""});
    setFormError(""); setModal({type:"charge"});
  }
  function submitCharge() {
    const f = chargeForm, amount = parseFloat(f.amount);
    if (isNaN(amount)||amount<=0) return setFormError("Ingresá un monto válido.");
    if (!f.date) return setFormError("Ingresá una fecha.");
    const entry = {id:uid(),type:"cargo",amount,date:f.date,note:f.note.trim()||"Cargo manual",paymentMethod:"Cuenta corriente",createdAt:Date.now()};
    updateAccounts(accounts.map(a=>a.id===f.accId?{...a,entries:[entry,...a.entries]}:a));
    setModal(null); showToast("Cargo registrado");
  }

  function openAddPayment(accId) {
    const acc = accounts.find(a=>a.id===accId);
    const balance = accBalance(acc);
    setPayForm({accId,amount:String(Math.max(0,balance)),date:todayStr(),note:"",paymentMethod:SETTLE_METHODS[0]});
    setFormError(""); setModal({type:"payment"});
  }
  function submitPayment() {
    const f = payForm, amount = parseFloat(f.amount);
    if (isNaN(amount)||amount<=0) return setFormError("Ingresá un monto válido.");
    if (!f.date) return setFormError("Ingresá una fecha.");
    const acc = accounts.find(a=>a.id===f.accId);
    const balance = accBalance(acc);
    if (amount>balance+0.01) return setFormError(`El pago (${money(amount)}) supera el saldo pendiente (${money(balance)}).`);
    const entry = {id:uid(),type:"pago",amount,date:f.date,note:f.note.trim(),paymentMethod:f.paymentMethod,createdAt:Date.now()};
    updateAccounts(accounts.map(a=>a.id===f.accId?{...a,entries:[entry,...a.entries]}:a));
    setModal(null); showToast("Pago registrado");
  }

  function deleteAccountEntry(accId, entryId) {
    updateAccounts(accounts.map(a=>a.id===accId?{...a,entries:a.entries.filter(e=>e.id!==entryId)}:a));
    setModal(null); showToast("Movimiento eliminado");
  }
  function deleteAccount(id) {
    updateAccounts(accounts.filter(a=>a.id!==id));
    setModal(null); showToast("Cuenta eliminada");
  }

  /* ── Derivados ── */
  const lowStockProducts = useMemo(()=>products.filter(p=>p.stock<=LOW_STOCK).sort((a,b)=>a.stock-b.stock),[products]);
  const monthSales = useMemo(()=>sales.filter(s=>isInCurrentMonth(s.date)),[sales]);
  const monthTx = useMemo(()=>transactions.filter(t=>isInCurrentMonth(t.date)),[transactions]);
  const monthIncomeManual = useMemo(()=>monthTx.filter(t=>t.type==="ingreso").reduce((a,t)=>a+t.amount,0),[monthTx]);
  const monthExpense = useMemo(()=>monthTx.filter(t=>t.type==="egreso").reduce((a,t)=>a+t.amount,0),[monthTx]);
  const monthSalesTotal = useMemo(()=>monthSales.reduce((a,s)=>a+s.total,0),[monthSales]);
  const monthIncomeTotal = monthSalesTotal+monthIncomeManual;
  const monthBalance = monthIncomeTotal-monthExpense;

  const totalPendiente = useMemo(()=>accounts.reduce((s,a)=>s+Math.max(0,accBalance(a)),0),[accounts]);

  const last14 = useMemo(()=>{
    const days=[];
    for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
    return days.map(d=>({key:d,label:fmtShort(d),ventas:sales.filter(s=>s.date===d).reduce((a,s)=>a+s.total,0)}));
  },[sales]);

  const recentSales = useMemo(()=>[...sales].sort((a,b)=>b.createdAt-a.createdAt).slice(0,5),[sales]);
  const filteredProducts = useMemo(()=>{const q=stockSearch.trim().toLowerCase();if(!q)return products;return products.filter(p=>[p.name,p.category,p.sku,p.color].join(" ").toLowerCase().includes(q));},[products,stockSearch]);
  const filteredSales = useMemo(()=>{const q=salesSearch.trim().toLowerCase();const list=[...sales].sort((a,b)=>b.createdAt-a.createdAt);if(!q)return list;return list.filter(s=>[s.productName,s.customer,s.paymentMethod].join(" ").toLowerCase().includes(q));},[sales,salesSearch]);
  const filteredTx = useMemo(()=>{const list=[...transactions].sort((a,b)=>b.createdAt-a.createdAt);if(financeFilter==="todos")return list;return list.filter(t=>t.type===financeFilter);},[transactions,financeFilter]);

  const filteredAccounts = useMemo(()=>{
    const q=recSearch.trim().toLowerCase();
    let list=accounts.filter(a=>!q||a.customerName.toLowerCase().includes(q));
    if(!showSettled) list=list.filter(a=>accBalance(a)>0.01);
    return list.sort((a,b)=>accBalance(b)-accBalance(a));
  },[accounts,recSearch,showSettled]);

  const reportStart = useMemo(()=>{
    const now=new Date();
    if(reportRange==="week") return startOfWeek(now);
    if(reportRange==="month") return new Date(now.getFullYear(),now.getMonth(),1);
    if(reportRange==="quarter"){const d=new Date(now);d.setMonth(d.getMonth()-3);return d;}
    const allDates=[...sales.map(s=>s.date),...transactions.map(t=>t.date)];
    if(!allDates.length) return new Date(now.getFullYear(),now.getMonth(),1);
    return parseD(allDates.sort()[0]);
  },[reportRange,sales,transactions]);

  const reportSales = useMemo(()=>sales.filter(s=>parseD(s.date)>=reportStart),[sales,reportStart]);
  const reportTx = useMemo(()=>transactions.filter(t=>parseD(t.date)>=reportStart),[transactions,reportStart]);
  const reportIncome = reportSales.reduce((a,s)=>a+s.total,0)+reportTx.filter(t=>t.type==="ingreso").reduce((a,t)=>a+t.amount,0);
  const reportExpense = reportTx.filter(t=>t.type==="egreso").reduce((a,t)=>a+t.amount,0);

  const spanDays = Math.max(1,Math.round((new Date()-reportStart)/86400000));
  const groupMode = spanDays<=31?"day":spanDays<=150?"week":"month";
  function bucketKey(dateStr){const d=parseD(dateStr);if(groupMode==="day")return dateStr;if(groupMode==="week")return startOfWeek(d).toISOString().slice(0,10);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
  function bucketLabel(key){if(groupMode==="month"){const[y,m]=key.split("-");return new Date(y,m-1,1).toLocaleDateString("es-AR",{month:"short",year:"2-digit"});}if(groupMode==="week")return"Sem "+fmtShort(key);return fmtShort(key);}

  const reportChartData = useMemo(()=>{
    const map={};
    reportSales.forEach(s=>{const k=bucketKey(s.date);map[k]=map[k]||{ventas:0,otros:0,egresos:0};map[k].ventas+=s.total;});
    reportTx.forEach(t=>{const k=bucketKey(t.date);map[k]=map[k]||{ventas:0,otros:0,egresos:0};if(t.type==="ingreso")map[k].otros+=t.amount;else map[k].egresos+=t.amount;});
    return Object.keys(map).sort().map(k=>({label:bucketLabel(k),ingresos:map[k].ventas+map[k].otros,egresos:map[k].egresos}));
  },[reportSales,reportTx,groupMode]);

  const topProducts = useMemo(()=>{const map={};reportSales.forEach(s=>{map[s.productId||s.productName]=map[s.productId||s.productName]||{name:s.productName,qty:0,revenue:0};map[s.productId||s.productName].qty+=s.quantity;map[s.productId||s.productName].revenue+=s.total;});return Object.values(map).sort((a,b)=>b.revenue-a.revenue).slice(0,6);},[reportSales]);
  const categoryBreakdown = useMemo(()=>{const map={};reportSales.forEach(s=>{const c=s.category||"Sin categoría";map[c]=(map[c]||0)+s.total;});return Object.entries(map).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);},[reportSales]);
  const stockRetailValue = products.reduce((a,p)=>a+p.price*p.stock,0);
  const stockCostValue = products.reduce((a,p)=>a+p.cost*p.stock,0);

  /* ── Navegación ── */
  const NAV = [
    {id:"dashboard",label:"Panel",icon:LayoutDashboard},
    {id:"stock",label:"Stock",icon:Package},
    {id:"sales",label:"Ventas",icon:ShoppingCart},
    {id:"finance",label:"Ingresos y egresos",icon:Wallet},
    {id:"receivables",label:"Cuentas por cobrar",icon:Receipt},
    {id:"reports",label:"Reportes",icon:BarChart3},
  ];

  return (
    <div className="msapp">
      <style>{CSS}</style>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-seal">MS</div>
          <div className="brand-text"><strong>Maria Speranza</strong><span>Gestión interna</span></div>
        </div>
        <nav className="nav">
          {NAV.map(n=>(
            <button key={n.id} className={`nav-item${tab===n.id?" active":""}`} onClick={()=>setTab(n.id)}>
              <n.icon size={17}/><span>{n.label}</span>
              {n.id==="receivables"&&totalPendiente>0&&<span className="nav-badge">{accounts.filter(a=>accBalance(a)>0.01).length}</span>}
            </button>
          ))}
        </nav>
        <button className="nav-item settings-btn" onClick={()=>setModal({type:"settings"})}><Settings size={17}/><span>Ajustes</span></button>
        <p className="shared-note">Datos compartidos con tu equipo</p>
      </aside>

      <main className="main">
        {loading?(
          <div className="loading-wrap"><Loader2 className="spin" size={22}/>Cargando datos…</div>
        ):(
          <>
            {/* ── DASHBOARD ── */}
            {tab==="dashboard"&&(
              <section>
                <header className="page-head"><h1>Panel general</h1><p>Resumen del mes en curso</p></header>
                <div className="kpi-grid">
                  <KpiCard label="Ventas del mes" value={monthSales.length} sub={money(monthSalesTotal)}/>
                  <KpiCard label="Ingresos del mes" value={money(monthIncomeTotal)} tone="positive"/>
                  <KpiCard label="Egresos del mes" value={money(monthExpense)} tone="negative"/>
                  <KpiCard label="Balance del mes" value={money(monthBalance)} tone={monthBalance>=0?"positive":"negative"}/>
                  <KpiCard label="Stock bajo" value={lowStockProducts.length} tone={lowStockProducts.length>0?"warning":undefined}/>
                  <KpiCard label="Cuentas pendientes" value={money(totalPendiente)} tone={totalPendiente>0?"warning":undefined} sub={`${accounts.filter(a=>accBalance(a)>0.01).length} cliente(s)`}/>
                </div>
                <div className="grid-2">
                  <div className="card">
                    <h3>Ventas — últimos 14 días</h3>
                    {!sales.length?<p className="muted">Todavía no hay ventas registradas.</p>:(
                      <div style={{height:220}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={last14} margin={{top:6,right:6,left:-18,bottom:0}}>
                            <CartesianGrid stroke="var(--border)" vertical={false}/>
                            <XAxis dataKey="label" tick={{fontSize:11,fill:"var(--slate)"}} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fontSize:11,fill:"var(--slate)"}} axisLine={false} tickLine={false} width={56}/>
                            <Tooltip formatter={v=>money(v)} contentStyle={{fontSize:12,borderRadius:8,border:"1px solid var(--border)"}}/>
                            <Bar dataKey="ventas" fill="var(--accent)" radius={[4,4,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="card">
                    <h3>Stock para reponer</h3>
                    {!lowStockProducts.length?<p className="muted">Todo el stock está en buen nivel.</p>:(
                      <ul className="simple-list">
                        {lowStockProducts.slice(0,6).map(p=>(
                          <li key={p.id}><span>{p.name} <em>· {p.talle} {p.color}</em></span><StockBadge stock={p.stock}/></li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="grid-2">
                  <div className="card">
                    <h3>Últimas ventas</h3>
                    {!recentSales.length?<p className="muted">Registrá tu primera venta desde la pestaña Ventas.</p>:(
                      <table className="table">
                        <thead><tr><th>Fecha</th><th>Producto</th><th>Cliente</th><th className="num">Total</th></tr></thead>
                        <tbody>{recentSales.map(s=>(
                          <tr key={s.id}><td>{fmtShort(s.date)}</td><td>{s.productName} <span className="dim">· {s.talle}/{s.color}</span></td><td>{s.customer||"—"}</td><td className="num mono">{money(s.total)}</td></tr>
                        ))}</tbody>
                      </table>
                    )}
                  </div>
                  <div className="card">
                    <h3>Cuentas con saldo pendiente</h3>
                    {!accounts.filter(a=>accBalance(a)>0.01).length?<p className="muted">No hay cuentas pendientes.</p>:(
                      <ul className="simple-list">
                        {accounts.filter(a=>accBalance(a)>0.01).sort((a,b)=>accBalance(b)-accBalance(a)).slice(0,5).map(a=>(
                          <li key={a.id}>
                            <span style={{fontWeight:600}}>{a.customerName}</span>
                            <span className="mono tone-negative" style={{fontSize:13}}>{money(accBalance(a))}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ── STOCK ── */}
            {tab==="stock"&&(
              <section>
                <header className="page-head row"><div><h1>Stock</h1><p>{products.length} producto(s) cargado(s)</p></div><button className="btn btn-primary" onClick={openAddProduct}><Plus size={15}/>Nuevo producto</button></header>
                <div className="toolbar"><div className="search-box"><Search size={15}/><input placeholder="Buscar por nombre, categoría o SKU…" value={stockSearch} onChange={e=>setStockSearch(e.target.value)}/></div></div>
                {!products.length?(
                  <EmptyState icon={Package} title="Todavía no agregaste productos" hint="Cargá tu primer producto para empezar a controlar el stock." actionLabel="Agregar producto" onAction={openAddProduct}/>
                ):(
                  <div className="card no-pad">
                    <table className="table">
                      <thead><tr><th>Producto</th><th>Categoría</th><th>Talle</th><th>Color</th><th>SKU</th><th className="num">Precio</th><th className="num">Stock</th><th>Estado</th><th></th></tr></thead>
                      <tbody>
                        {filteredProducts.map(p=>(
                          <tr key={p.id}><td>{p.name}</td><td>{p.category}</td><td>{p.talle}</td><td>{p.color||"—"}</td><td className="mono dim">{p.sku}</td><td className="num mono">{money(p.price)}</td><td className="num mono">{p.stock}</td><td><StockBadge stock={p.stock}/></td>
                            <td className="actions"><button className="icon-btn" onClick={()=>openEditProduct(p)}><Pencil size={14}/></button><button className="icon-btn danger" onClick={()=>setModal({type:"confirmDeleteProduct",id:p.id,name:p.name})}><Trash2 size={14}/></button></td>
                          </tr>
                        ))}
                        {!filteredProducts.length&&<tr><td colSpan={9} className="muted center">Sin resultados para esa búsqueda.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* ── VENTAS ── */}
            {tab==="sales"&&(
              <section>
                <header className="page-head row"><div><h1>Ventas</h1><p>{sales.length} venta(s) registrada(s)</p></div><button className="btn btn-primary" onClick={openAddSale}><Plus size={15}/>Nueva venta</button></header>
                <div className="toolbar"><div className="search-box"><Search size={15}/><input placeholder="Buscar por producto o cliente…" value={salesSearch} onChange={e=>setSalesSearch(e.target.value)}/></div></div>
                {!sales.length?(
                  <EmptyState icon={ShoppingCart} title="Todavía no hay ventas" hint="Registrá una venta y el stock se actualiza automáticamente." actionLabel="Registrar venta" onAction={openAddSale}/>
                ):(
                  <div className="card no-pad">
                    <table className="table">
                      <thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th className="num">Precio</th><th className="num">Total</th><th>Cliente</th><th>Pago</th><th></th></tr></thead>
                      <tbody>{filteredSales.map(s=>(
                        <tr key={s.id}>
                          <td>{fmtFull(s.date)}</td><td>{s.productName} <span className="dim">· {s.talle}/{s.color}</span></td><td className="num mono">{s.quantity}</td><td className="num mono">{money(s.unitPrice)}</td><td className="num mono">{money(s.total)}</td><td>{s.customer||"—"}</td>
                          <td>{s.paymentMethod==="Cuenta corriente"?<Badge tone="warning">Cuenta corriente</Badge>:s.paymentMethod}</td>
                          <td className="actions"><button className="icon-btn danger" onClick={()=>setModal({type:"confirmDeleteSale",id:s.id})}><Trash2 size={14}/></button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* ── FINANZAS ── */}
            {tab==="finance"&&(
              <section>
                <header className="page-head row"><div><h1>Ingresos y egresos</h1><p>Movimientos manuales</p></div><button className="btn btn-primary" onClick={openAddTx}><Plus size={15}/>Nuevo movimiento</button></header>
                <div className="toolbar"><div className="seg">{["todos","ingreso","egreso"].map(f=><button key={f} className={`seg-btn${financeFilter===f?" active":""}`} onClick={()=>setFinanceFilter(f)}>{f==="todos"?"Todos":f==="ingreso"?"Ingresos":"Egresos"}</button>)}</div></div>
                {!transactions.length?(
                  <EmptyState icon={Wallet} title="Sin movimientos manuales" hint="Sumá ingresos o egresos que no provienen de una venta." actionLabel="Nuevo movimiento" onAction={openAddTx}/>
                ):(
                  <div className="card no-pad">
                    <table className="table">
                      <thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th className="num">Monto</th><th></th></tr></thead>
                      <tbody>{filteredTx.map(t=>(
                        <tr key={t.id}><td>{fmtFull(t.date)}</td><td>{t.type==="ingreso"?<Badge tone="positive">Ingreso</Badge>:<Badge tone="negative">Egreso</Badge>}</td><td>{t.category}</td><td>{t.description||"—"}</td><td className="num mono">{t.type==="ingreso"?"+":"−"} {money(t.amount)}</td>
                          <td className="actions"><button className="icon-btn danger" onClick={()=>setModal({type:"confirmDeleteTx",id:t.id})}><Trash2 size={14}/></button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* ── CUENTAS POR COBRAR ── */}
            {tab==="receivables"&&(
              <section>
                <header className="page-head row">
                  <div>
                    <h1>Cuentas por cobrar</h1>
                    <p>{accounts.filter(a=>accBalance(a)>0.01).length} cliente(s) con saldo pendiente · Total: {money(totalPendiente)}</p>
                  </div>
                  <button className="btn btn-primary" onClick={openAddAccount}><Plus size={15}/>Nueva cuenta</button>
                </header>

                <div className="toolbar">
                  <div className="search-box"><Search size={15}/><input placeholder="Buscar cliente…" value={recSearch} onChange={e=>setRecSearch(e.target.value)}/></div>
                  <label className="toggle-label"><input type="checkbox" checked={showSettled} onChange={e=>setShowSettled(e.target.checked)}/> Mostrar cuentas saldadas</label>
                </div>

                {!accounts.length?(
                  <EmptyState icon={Receipt} title="Sin cuentas por cobrar" hint="Creá una cuenta para un cliente o usá 'Cuenta corriente' al registrar una venta y se genera automáticamente." actionLabel="Nueva cuenta" onAction={openAddAccount}/>
                ):!filteredAccounts.length?(
                  <div className="card" style={{textAlign:"center",padding:"32px 16px"}}><p className="muted">No hay cuentas con saldo pendiente.{!showSettled&&" Activá 'Mostrar cuentas saldadas' para verlas todas."}</p></div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {filteredAccounts.map(acc=>{
                      const balance=accBalance(acc), paid=accPaid(acc), total=accTotal(acc);
                      const pct=total>0?Math.min(100,Math.round(paid/total*100)):100;
                      const settled=balance<=0.01;
                      const isOpen=expandedAcc===acc.id;
                      return (
                        <div key={acc.id} className={`acc-card${settled?" settled":""}`}>
                          <div className="acc-head" onClick={()=>setExpandedAcc(isOpen?null:acc.id)}>
                            <div className="acc-left">
                              <div className="acc-avatar">{acc.customerName.slice(0,1).toUpperCase()}</div>
                              <div>
                                <p className="acc-name">{acc.customerName}</p>
                                <p className="acc-meta">{acc.entries.length} movimiento(s) · Desde {fmtFull(acc.entries.length?[...acc.entries].sort((a,b)=>a.createdAt-b.createdAt)[0].date:todayStr())}</p>
                              </div>
                            </div>
                            <div className="acc-right">
                              <div style={{textAlign:"right"}}>
                                {settled?<Badge tone="positive"><CheckCircle2 size={11} style={{marginRight:4,verticalAlign:"middle"}}/>Saldada</Badge>:<span className="acc-balance">{money(balance)}</span>}
                                {!settled&&<p className="acc-meta">{pct}% abonado ({money(paid)} de {money(total)})</p>}
                              </div>
                              <div className="acc-actions" onClick={e=>e.stopPropagation()}>
                                {!settled&&<button className="btn btn-primary btn-sm" onClick={()=>openAddPayment(acc.id)}>Registrar pago</button>}
                                <button className="btn btn-ghost btn-sm" onClick={()=>openAddCharge(acc.id)}>+ Cargo</button>
                                <button className="icon-btn danger" onClick={()=>setModal({type:"confirmDeleteAccount",id:acc.id,name:acc.customerName})}><Trash2 size={14}/></button>
                              </div>
                              <span className="acc-chevron">{isOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</span>
                            </div>
                          </div>

                          {!settled&&total>0&&(
                            <div className="acc-progress-wrap">
                              <div className="acc-progress-bar" style={{width:pct+"%"}}/>
                            </div>
                          )}

                          {isOpen&&(
                            <div className="acc-entries">
                              {!acc.entries.length?<p className="muted" style={{padding:"12px 16px"}}>Sin movimientos todavía.</p>:(
                                <table className="table">
                                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Método</th><th className="num">Monto</th><th></th></tr></thead>
                                  <tbody>{[...acc.entries].sort((a,b)=>b.createdAt-a.createdAt).map(e=>(
                                    <tr key={e.id}>
                                      <td>{fmtFull(e.date)}</td>
                                      <td>{e.type==="cargo"?<Badge tone="negative">Cargo</Badge>:<Badge tone="positive">Pago</Badge>}</td>
                                      <td>{e.note||"—"}</td>
                                      <td className="dim">{e.paymentMethod}</td>
                                      <td className="num mono">{e.type==="cargo"?"-":"+"}  {money(e.amount)}</td>
                                      <td className="actions">
                                        {!e.saleId&&<button className="icon-btn danger" onClick={()=>setModal({type:"confirmDeleteEntry",accId:acc.id,entryId:e.id})}><Trash2 size={13}/></button>}
                                      </td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ── REPORTES ── */}
            {tab==="reports"&&(
              <section>
                <header className="page-head row">
                  <div><h1>Reportes</h1><p>Estadísticas de ventas e ingresos</p></div>
                  <div className="seg">{[["week","Esta semana"],["month","Este mes"],["quarter","3 meses"],["all","Todo"]].map(([k,l])=><button key={k} className={`seg-btn${reportRange===k?" active":""}`} onClick={()=>setReportRange(k)}>{l}</button>)}</div>
                </header>
                <div className="kpi-grid">
                  <KpiCard label="Ventas en el período" value={reportSales.length} sub={money(reportSales.reduce((a,s)=>a+s.total,0))}/>
                  <KpiCard label="Ingresos totales" value={money(reportIncome)} tone="positive"/>
                  <KpiCard label="Egresos totales" value={money(reportExpense)} tone="negative"/>
                  <KpiCard label="Balance" value={money(reportIncome-reportExpense)} tone={reportIncome-reportExpense>=0?"positive":"negative"}/>
                </div>
                <div className="card">
                  <h3>Ingresos vs. egresos</h3>
                  {!reportChartData.length?<p className="muted">No hay datos para este período.</p>:(
                    <div style={{height:240}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportChartData} margin={{top:6,right:6,left:-18,bottom:0}}>
                          <CartesianGrid stroke="var(--border)" vertical={false}/>
                          <XAxis dataKey="label" tick={{fontSize:11,fill:"var(--slate)"}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:11,fill:"var(--slate)"}} axisLine={false} tickLine={false} width={56}/>
                          <Tooltip formatter={v=>money(v)} contentStyle={{fontSize:12,borderRadius:8,border:"1px solid var(--border)"}}/>
                          <Legend wrapperStyle={{fontSize:12}}/>
                          <Bar dataKey="ingresos" name="Ingresos" fill="var(--positive)" radius={[4,4,0,0]}/>
                          <Bar dataKey="egresos" name="Egresos" fill="var(--negative)" radius={[4,4,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                <div className="grid-2">
                  <div className="card">
                    <h3>Productos más vendidos</h3>
                    {!topProducts.length?<p className="muted">Sin ventas en este período.</p>:(
                      <div style={{height:240}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topProducts} layout="vertical" margin={{top:6,right:18,left:6,bottom:0}}>
                            <CartesianGrid stroke="var(--border)" horizontal={false}/>
                            <XAxis type="number" tick={{fontSize:11,fill:"var(--slate)"}} axisLine={false} tickLine={false}/>
                            <YAxis type="category" dataKey="name" width={110} tick={{fontSize:11,fill:"var(--ink)"}} axisLine={false} tickLine={false}/>
                            <Tooltip formatter={(v,n)=>n==="revenue"?money(v):v} contentStyle={{fontSize:12,borderRadius:8,border:"1px solid var(--border)"}}/>
                            <Bar dataKey="revenue" name="Ingresos" fill="var(--accent)" radius={[0,4,4,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="card">
                    <h3>Ventas por categoría</h3>
                    {!categoryBreakdown.length?<p className="muted">Sin ventas en este período.</p>:(
                      <div style={{height:240}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={categoryBreakdown} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                              {categoryBreakdown.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                            </Pie>
                            <Tooltip formatter={v=>money(v)} contentStyle={{fontSize:12,borderRadius:8,border:"1px solid var(--border)"}}/>
                            <Legend wrapperStyle={{fontSize:11}}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
                <div className="card">
                  <h3>Valor de stock actual</h3>
                  <div className="kpi-grid">
                    <KpiCard label="Valor a precio de venta" value={money(stockRetailValue)}/>
                    <KpiCard label="Valor a costo" value={money(stockCostValue)}/>
                    <KpiCard label="Margen potencial" value={money(stockRetailValue-stockCostValue)} tone="positive"/>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* ── MODALES ── */}

      {modal?.type==="product"&&productForm&&(
        <Modal title={modal.editingId?"Editar producto":"Nuevo producto"} onClose={()=>setModal(null)}>
          <div className="form">
            <Field label="Nombre del producto"><input className="input" value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})} placeholder="Ej: Vestido Lino" autoFocus/></Field>
            <div className="form-row">
              <Field label="Categoría"><input className="input" list="cat-opts" value={productForm.category} onChange={e=>setProductForm({...productForm,category:e.target.value})} placeholder="Ej: Vestidos"/><datalist id="cat-opts">{CATEGORY_SUGGESTIONS.map(c=><option key={c} value={c}/>)}</datalist></Field>
              <Field label="Talle"><input className="input" list="talle-opts" value={productForm.talle} onChange={e=>setProductForm({...productForm,talle:e.target.value})} placeholder="Ej: M"/><datalist id="talle-opts">{TALLE_SUGGESTIONS.map(t=><option key={t} value={t}/>)}</datalist></Field>
            </div>
            <div className="form-row">
              <Field label="Color"><input className="input" value={productForm.color} onChange={e=>setProductForm({...productForm,color:e.target.value})} placeholder="Ej: Negro"/></Field>
              <Field label="SKU (opcional)"><input className="input mono" value={productForm.sku} onChange={e=>setProductForm({...productForm,sku:e.target.value})} placeholder="Se genera solo"/></Field>
            </div>
            <div className="form-row">
              <Field label="Precio de venta"><input className="input mono" type="number" min="0" step="0.01" value={productForm.price} onChange={e=>setProductForm({...productForm,price:e.target.value})} placeholder="0"/></Field>
              <Field label="Costo (opcional)"><input className="input mono" type="number" min="0" step="0.01" value={productForm.cost} onChange={e=>setProductForm({...productForm,cost:e.target.value})} placeholder="0"/></Field>
            </div>
            <Field label="Stock inicial"><input className="input mono" type="number" min="0" step="1" value={productForm.stock} onChange={e=>setProductForm({...productForm,stock:e.target.value})} placeholder="0"/></Field>
            {formError&&<p className="form-error"><AlertTriangle size={14}/>{formError}</p>}
            <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={submitProduct}>{modal.editingId?"Guardar cambios":"Agregar producto"}</button></div>
          </div>
        </Modal>
      )}

      {modal?.type==="sale"&&saleForm&&(
        <Modal title="Nueva venta" onClose={()=>setModal(null)}>
          <div className="form">
            <Field label="Producto"><select className="input" value={saleForm.productId} onChange={e=>onSaleProductChange(e.target.value)}><option value="">Seleccionar…</option>{products.map(p=><option key={p.id} value={p.id} disabled={p.stock<=0}>{p.name} · {p.talle}/{p.color} (stock: {p.stock})</option>)}</select></Field>
            <div className="form-row">
              <Field label="Cantidad"><input className="input mono" type="number" min="1" step="1" value={saleForm.quantity} onChange={e=>setSaleForm({...saleForm,quantity:e.target.value})}/></Field>
              <Field label="Precio unitario"><input className="input mono" type="number" min="0" step="0.01" value={saleForm.unitPrice} onChange={e=>setSaleForm({...saleForm,unitPrice:e.target.value})}/></Field>
            </div>
            <div className="form-row">
              <Field label="Fecha"><input className="input" type="date" value={saleForm.date} onChange={e=>setSaleForm({...saleForm,date:e.target.value})}/></Field>
              <Field label="Método de pago"><select className="input" value={saleForm.paymentMethod} onChange={e=>setSaleForm({...saleForm,paymentMethod:e.target.value})}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</select></Field>
            </div>
            <Field label={saleForm.paymentMethod==="Cuenta corriente"?"Cliente (obligatorio para cuenta corriente)":"Cliente (opcional)"}><input className="input" value={saleForm.customer} onChange={e=>setSaleForm({...saleForm,customer:e.target.value})} placeholder="Nombre del cliente"/></Field>
            {saleForm.paymentMethod==="Cuenta corriente"&&<p className="info-note">💡 Se creará (o actualizará) la cuenta corriente de este cliente automáticamente.</p>}
            {formError&&<p className="form-error"><AlertTriangle size={14}/>{formError}</p>}
            <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={submitSale}>Registrar venta</button></div>
          </div>
        </Modal>
      )}

      {modal?.type==="tx"&&txForm&&(
        <Modal title="Nuevo movimiento" onClose={()=>setModal(null)}>
          <div className="form">
            <div className="seg full"><button type="button" className={`seg-btn${txForm.type==="ingreso"?" active":""}`} onClick={()=>setTxForm({...txForm,type:"ingreso",category:INCOME_CATS[0]})}>Ingreso</button><button type="button" className={`seg-btn${txForm.type==="egreso"?" active":""}`} onClick={()=>setTxForm({...txForm,type:"egreso",category:EXPENSE_CATS[0]})}>Egreso</button></div>
            <Field label="Categoría"><select className="input" value={txForm.category} onChange={e=>setTxForm({...txForm,category:e.target.value})}>{(txForm.type==="ingreso"?INCOME_CATS:EXPENSE_CATS).map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
            <div className="form-row">
              <Field label="Monto"><input className="input mono" type="number" min="0" step="0.01" value={txForm.amount} onChange={e=>setTxForm({...txForm,amount:e.target.value})}/></Field>
              <Field label="Fecha"><input className="input" type="date" value={txForm.date} onChange={e=>setTxForm({...txForm,date:e.target.value})}/></Field>
            </div>
            <Field label="Descripción (opcional)"><input className="input" value={txForm.description} onChange={e=>setTxForm({...txForm,description:e.target.value})} placeholder="Detalle del movimiento"/></Field>
            {formError&&<p className="form-error"><AlertTriangle size={14}/>{formError}</p>}
            <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={submitTx}>Guardar movimiento</button></div>
          </div>
        </Modal>
      )}

      {modal?.type==="account"&&accForm&&(
        <Modal title="Nueva cuenta de cliente" onClose={()=>setModal(null)} width={400}>
          <div className="form">
            <Field label="Nombre del cliente"><input className="input" value={accForm.customerName} onChange={e=>setAccForm({...accForm,customerName:e.target.value})} placeholder="Ej: María González" autoFocus/></Field>
            {formError&&<p className="form-error"><AlertTriangle size={14}/>{formError}</p>}
            <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={submitAccount}>Crear cuenta</button></div>
          </div>
        </Modal>
      )}

      {modal?.type==="charge"&&chargeForm&&(
        <Modal title="Agregar cargo a la cuenta" onClose={()=>setModal(null)} width={420}>
          <div className="form">
            <div className="form-row">
              <Field label="Monto"><input className="input mono" type="number" min="0" step="0.01" value={chargeForm.amount} onChange={e=>setChargeForm({...chargeForm,amount:e.target.value})} autoFocus/></Field>
              <Field label="Fecha"><input className="input" type="date" value={chargeForm.date} onChange={e=>setChargeForm({...chargeForm,date:e.target.value})}/></Field>
            </div>
            <Field label="Descripción (opcional)"><input className="input" value={chargeForm.note} onChange={e=>setChargeForm({...chargeForm,note:e.target.value})} placeholder="Ej: Arreglo, reserva…"/></Field>
            {formError&&<p className="form-error"><AlertTriangle size={14}/>{formError}</p>}
            <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={submitCharge}>Agregar cargo</button></div>
          </div>
        </Modal>
      )}

      {modal?.type==="payment"&&payForm&&(
        <Modal title="Registrar pago" onClose={()=>setModal(null)} width={420}>
          <div className="form">
            <p className="confirm-text" style={{marginBottom:0}}>
              Saldo actual: <strong className="tone-negative">{money(accBalance(accounts.find(a=>a.id===payForm.accId)||{entries:[]}))}</strong>
            </p>
            <div className="form-row">
              <Field label="Monto abonado"><input className="input mono" type="number" min="0" step="0.01" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} autoFocus/></Field>
              <Field label="Fecha"><input className="input" type="date" value={payForm.date} onChange={e=>setPayForm({...payForm,date:e.target.value})}/></Field>
            </div>
            <div className="form-row">
              <Field label="Método de pago"><select className="input" value={payForm.paymentMethod} onChange={e=>setPayForm({...payForm,paymentMethod:e.target.value})}>{SETTLE_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</select></Field>
              <Field label="Nota (opcional)"><input className="input" value={payForm.note} onChange={e=>setPayForm({...payForm,note:e.target.value})} placeholder="Ej: cuota 1/3…"/></Field>
            </div>
            {formError&&<p className="form-error"><AlertTriangle size={14}/>{formError}</p>}
            <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={submitPayment}>Registrar pago</button></div>
          </div>
        </Modal>
      )}

      {modal?.type==="confirmDeleteProduct"&&<Modal title="Eliminar producto" onClose={()=>setModal(null)} width={400}><p className="confirm-text">¿Eliminar <strong>{modal.name}</strong>? Las ventas registradas no se modifican.</p><div className="form-actions"><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-danger" onClick={()=>deleteProduct(modal.id)}>Eliminar</button></div></Modal>}
      {modal?.type==="confirmDeleteSale"&&<Modal title="Eliminar venta" onClose={()=>setModal(null)} width={400}><p className="confirm-text">¿Eliminar esta venta? El stock se repondrá automáticamente. Si era cuenta corriente, también se eliminará el cargo de la cuenta del cliente.</p><div className="form-actions"><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-danger" onClick={()=>deleteSale(modal.id)}>Eliminar</button></div></Modal>}
      {modal?.type==="confirmDeleteTx"&&<Modal title="Eliminar movimiento" onClose={()=>setModal(null)} width={400}><p className="confirm-text">¿Eliminar este movimiento?</p><div className="form-actions"><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-danger" onClick={()=>deleteTx(modal.id)}>Eliminar</button></div></Modal>}
      {modal?.type==="confirmDeleteAccount"&&<Modal title="Eliminar cuenta" onClose={()=>setModal(null)} width={400}><p className="confirm-text">¿Eliminar la cuenta de <strong>{modal.name}</strong>? Se borrarán todos sus movimientos.</p><div className="form-actions"><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-danger" onClick={()=>deleteAccount(modal.id)}>Eliminar</button></div></Modal>}
      {modal?.type==="confirmDeleteEntry"&&<Modal title="Eliminar movimiento" onClose={()=>setModal(null)} width={400}><p className="confirm-text">¿Eliminar este movimiento de la cuenta?</p><div className="form-actions"><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-danger" onClick={()=>deleteAccountEntry(modal.accId,modal.entryId)}>Eliminar</button></div></Modal>}

      {modal?.type==="settings"&&(
        <Modal title="Ajustes" onClose={()=>setModal(null)} width={440}>
          <p className="confirm-text">Los datos se guardan de forma compartida con tu equipo. Cualquier miembro puede ver y editar la información.</p>
          <div className="danger-zone">
            <p><strong>Reiniciar todos los datos</strong></p>
            <p className="muted">Borra productos, ventas, movimientos y cuentas. No se puede deshacer.</p>
            {modal.confirming?<div className="form-actions"><button className="btn btn-ghost" onClick={()=>setModal({...modal,confirming:false})}>Cancelar</button><button className="btn btn-danger" onClick={resetAllData}>Sí, borrar todo</button></div>:<button className="btn btn-danger" onClick={()=>setModal({...modal,confirming:true})}><Trash2 size={14}/>Reiniciar datos</button>}
          </div>
        </Modal>
      )}

      {toast&&<div className="toast"><ClipboardList size={15}/>{toast}</div>}
    </div>
  );
}

/* ── CSS ── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.msapp{--bg:#F5F4F0;--surface:#FFFFFF;--surface-2:#FBFAF7;--ink:#20242B;--ink-soft:#4B5159;--slate:#767D87;--border:#E3E0D8;--accent:#2F5D62;--accent-soft:#E4ECEB;--positive:#3F7D58;--positive-soft:#E6F0E8;--negative:#B23A48;--negative-soft:#FAE6E8;--warning:#C97A2B;--warning-soft:#F8EADC;--radius:10px;font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--bg);display:flex;height:100vh;width:100%;overflow:hidden;}
.msapp *{box-sizing:border-box;}
.msapp h1,.msapp h3{font-family:'Fraunces',serif;margin:0;font-weight:600;letter-spacing:-0.01em;}
.msapp h1{font-size:22px;}.msapp h3{font-size:15px;margin-bottom:12px;}
.mono{font-family:'IBM Plex Mono',monospace;}.dim{color:var(--slate);font-size:0.92em;}.muted{color:var(--slate);font-size:13.5px;}.center{text-align:center;padding:24px 0!important;}
.tone-positive{color:var(--positive)!important;}.tone-negative{color:var(--negative)!important;}.tone-warning{color:var(--warning)!important;}
.sidebar{width:224px;flex-shrink:0;height:100%;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:18px 14px;gap:6px;overflow-y:auto;}
.brand{display:flex;align-items:center;gap:10px;padding:4px 6px 16px;border-bottom:1px solid var(--border);margin-bottom:10px;}
.brand-seal{width:34px;height:34px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-weight:600;font-size:13px;flex-shrink:0;}
.brand-text{display:flex;flex-direction:column;line-height:1.25;}.brand-text strong{font-size:13.5px;}.brand-text span{font-size:11px;color:var(--slate);}
.nav{display:flex;flex-direction:column;gap:2px;flex:1;}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;border:none;background:transparent;color:var(--ink-soft);font-size:13.5px;font-family:inherit;cursor:pointer;text-align:left;width:100%;position:relative;}
.nav-item:hover{background:var(--surface-2);}.nav-item.active{background:var(--accent-soft);color:var(--accent);font-weight:600;}
.nav-badge{position:absolute;right:10px;background:var(--warning);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;}
.settings-btn{border-top:1px solid var(--border);margin-top:6px;padding-top:12px;}
.shared-note{font-size:10.5px;color:var(--slate);padding:6px 10px 0;}
.main{flex:1;padding:26px 30px 40px;overflow-y:auto;height:100%;}
.page-head{margin-bottom:18px;}.page-head.row{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;}.page-head p{margin:4px 0 0;color:var(--slate);font-size:13px;}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin-bottom:18px;}
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;display:flex;flex-direction:column;gap:6px;}
.kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--slate);}.kpi-value{font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:600;}.kpi-value.tone-positive{color:var(--positive);}.kpi-value.tone-negative{color:var(--negative);}.kpi-value.tone-warning{color:var(--warning);}.kpi-sub{font-size:12px;color:var(--slate);}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:14px;}.card.no-pad{padding:0;overflow-x:auto;}
.table{width:100%;border-collapse:collapse;font-size:13px;}.table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--slate);font-weight:600;padding:11px 14px;border-bottom:1px solid var(--border);white-space:nowrap;}.table td{padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle;}.table tr:last-child td{border-bottom:none;}.table .num{text-align:right;}.table .actions{display:flex;gap:4px;justify-content:flex-end;}
.simple-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;}.simple-list li{display:flex;align-items:center;justify-content:space-between;font-size:13.5px;}
.toolbar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center;}
.search-box{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-width:320px;flex:1;color:var(--slate);}
.search-box input{border:none;outline:none;background:transparent;font-size:13px;width:100%;color:var(--ink);font-family:inherit;}
.toggle-label{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--ink-soft);cursor:pointer;white-space:nowrap;}
.seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:3px;gap:2px;}.seg.full{width:100%;}
.seg-btn{border:none;background:transparent;padding:7px 12px;border-radius:6px;font-size:12.5px;font-family:inherit;cursor:pointer;color:var(--ink-soft);flex:1;}.seg-btn.active{background:var(--surface);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,0.06);}
.badge{font-size:11.5px;padding:3px 9px;border-radius:999px;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:3px;}
.badge-positive{background:var(--positive-soft);color:var(--positive);}.badge-negative{background:var(--negative-soft);color:var(--negative);}.badge-warning{background:var(--warning-soft);color:var(--warning);}.badge-neutral{background:var(--surface-2);color:var(--slate);}
.btn{display:inline-flex;align-items:center;gap:6px;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;font-family:inherit;border:1px solid transparent;cursor:pointer;}
.btn-primary{background:var(--accent);color:#fff;}.btn-primary:hover{background:#264c50;}.btn-ghost{background:transparent;color:var(--ink-soft);border-color:var(--border);}.btn-ghost:hover{background:var(--surface-2);}.btn-danger{background:var(--negative);color:#fff;}.btn-danger:hover{background:#97303c;}
.btn-sm{padding:6px 10px;font-size:12px;}
.icon-btn{border:1px solid var(--border);background:var(--surface);border-radius:7px;padding:6px;display:inline-flex;cursor:pointer;color:var(--ink-soft);}.icon-btn:hover{background:var(--surface-2);}.icon-btn.danger:hover{background:var(--negative-soft);color:var(--negative);border-color:var(--negative-soft);}
.empty-state{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;background:var(--surface);border:1px dashed var(--border);border-radius:var(--radius);padding:48px 24px;}
.empty-icon{width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;margin-bottom:4px;}.empty-title{font-weight:600;font-size:14.5px;}.empty-hint{color:var(--slate);font-size:13px;max-width:320px;margin:0 0 6px;}
.modal-backdrop{position:fixed;inset:0;background:rgba(20,22,26,0.42);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px;}
.modal{background:var(--surface);border-radius:14px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,0.25);}
.modal-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);}
.modal-head h3{margin:0;}.modal-body{padding:18px 20px 22px;}
.form{display:flex;flex-direction:column;gap:14px;}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.field{display:flex;flex-direction:column;gap:5px;}.field-label{font-size:12px;color:var(--ink-soft);font-weight:600;}.field-error{font-size:11.5px;color:var(--negative);}
.input{border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:13.5px;font-family:inherit;background:var(--surface-2);color:var(--ink);width:100%;}.input:focus{outline:2px solid var(--accent);outline-offset:1px;background:var(--surface);}
.form-error{display:flex;align-items:center;gap:6px;color:var(--negative);font-size:12.5px;background:var(--negative-soft);padding:8px 10px;border-radius:8px;}
.info-note{font-size:12.5px;color:var(--accent);background:var(--accent-soft);padding:8px 10px;border-radius:8px;}
.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px;}
.confirm-text{font-size:13.5px;color:var(--ink-soft);line-height:1.5;margin:0 0 6px;}
.danger-zone{margin-top:16px;border-top:1px solid var(--border);padding-top:14px;}
/* Cuentas por cobrar */
.acc-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:box-shadow .15s;}
.acc-card:hover{box-shadow:0 2px 12px rgba(0,0,0,0.07);}.acc-card.settled{opacity:.7;}
.acc-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;gap:12px;}
.acc-left{display:flex;align-items:center;gap:12px;flex:1;min-width:0;}
.acc-avatar{width:36px;height:36px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;}
.acc-name{font-weight:600;font-size:14px;margin:0;}.acc-meta{font-size:11.5px;color:var(--slate);margin:2px 0 0;}
.acc-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.acc-balance{font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;color:var(--negative);}
.acc-actions{display:flex;gap:6px;align-items:center;}.acc-chevron{color:var(--slate);}
.acc-progress-wrap{height:4px;background:var(--surface-2);margin:0 16px 12px;}
.acc-progress-bar{height:100%;background:var(--positive);border-radius:2px;transition:width .3s;}
.acc-entries{border-top:1px solid var(--border);}
.loading-wrap{display:flex;align-items:center;gap:10px;color:var(--slate);font-size:14px;padding:60px 0;justify-content:center;}
.spin{animation:spin .9s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:60;}
@media(max-width:820px){.grid-2{grid-template-columns:1fr;}.acc-right{flex-direction:column;align-items:flex-end;gap:6px;}}
@media(max-width:700px){.msapp{flex-direction:column;height:100vh;}.sidebar{width:100%;height:auto;flex-direction:row;align-items:center;overflow-x:auto;overflow-y:visible;padding:10px 14px;flex-shrink:0;}.brand{border-bottom:none;border-right:1px solid var(--border);padding:0 14px 0 0;margin:0 10px 0 0;}.nav{flex-direction:row;flex:none;}.settings-btn{border-top:none;border-left:1px solid var(--border);margin:0;padding:9px 10px 9px 14px;}.shared-note{display:none;}.nav-item span{display:none;}.main{padding:18px 16px 32px;height:auto;flex:1;}.form-row{grid-template-columns:1fr;}}
`;
