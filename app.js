import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp,
  onSnapshot, query, orderBy, limit, runTransaction
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { INITIAL_STOCK } from "./initial-stock.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const views = ["#loading-view", "#setup-view", "#login-view", "#app-view"];
const state = { items: [], movements: [], user: null, reportPeriod: "day", unsubscribeItems: null, unsubscribeMovements: null };
let toastTimer;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatMoney = (cents) => money.format(Number(cents || 0) / 100);
const parseMoney = (value) => {
  const raw = String(value || "").trim().replace(/\s/g, "").replace(/R\$/gi, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : NaN;
};
const inputMoney = (cents) => Number.isInteger(cents) ? (cents / 100).toFixed(2).replace(".", ",") : "";

function showView(selector) { views.forEach((view) => $(view).classList.toggle("hidden", view !== selector)); }
function showToast(message, type = "success") {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3500);
}
function isConfigured() { return firebaseConfig.apiKey && !Object.values(firebaseConfig).some((value) => String(value).includes("COLE_AQUI")); }
function slugify(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]); }
function formatDate(timestamp) { return timestamp?.toDate ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(timestamp.toDate()) : "Agora"; }
function authErrorMessage(code) {
  return ({ "auth/invalid-credential": "E-mail ou senha incorretos.", "auth/invalid-email": "Digite um e-mail válido.", "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.", "auth/network-request-failed": "Sem conexão. Verifique sua internet." })[code] || "Não foi possível entrar. Tente novamente.";
}
function knownLotQuantity(item) { return (item.costLots || []).reduce((sum, lot) => sum + Number(lot.quantity || 0), 0); }
function uncostedQuantity(item) { return Math.max(0, Number(item.quantity || 0) - knownLotQuantity(item)); }

if (!isConfigured()) showView("#setup-view"); else startFirebase();

function startFirebase() {
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  onAuthStateChanged(auth, (user) => {
    state.user = user;
    if (!user) { stopListeners(); showView("#login-view"); return; }
    $("#user-email").textContent = user.email || "Usuário";
    showView("#app-view");
    startListeners(db);
  });
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    $("#login-error").textContent = "";
    button.disabled = true; button.textContent = "Entrando...";
    try { await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value); event.currentTarget.reset(); }
    catch (error) { $("#login-error").textContent = authErrorMessage(error.code); }
    finally { button.disabled = false; button.textContent = "Entrar"; }
  });
  $("#logout-button").addEventListener("click", () => signOut(auth));
  $("#seed-button").addEventListener("click", () => seedInventory(db));
  $("#movement-form").addEventListener("submit", (event) => submitMovement(event, db));
  $("#product-form").addEventListener("submit", (event) => saveProduct(event, db));
  $("#new-product-button").addEventListener("click", () => openProduct());
  $("#delete-product").addEventListener("click", () => deleteProduct(db));
}

function stopListeners() {
  state.unsubscribeItems?.(); state.unsubscribeMovements?.();
  state.unsubscribeItems = null; state.unsubscribeMovements = null;
}
function startListeners(db) {
  stopListeners();
  state.unsubscribeItems = onSnapshot(query(collection(db, "items"), orderBy("name")), (snapshot) => {
    state.items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); renderInventory();
  }, () => showToast("Não foi possível carregar o estoque. Confira as regras do Firestore.", "error"));
  state.unsubscribeMovements = onSnapshot(query(collection(db, "movements"), orderBy("createdAt", "desc"), limit(1000)), (snapshot) => {
    state.movements = snapshot.docs.map((movement) => ({ id: movement.id, ...movement.data() })); renderHistory(); renderReport();
  }, () => showToast("Não foi possível carregar o histórico.", "error"));
}

async function seedInventory(db) {
  const button = $("#seed-button"); button.disabled = true; button.textContent = "Importando...";
  try {
    const existing = await getDocs(collection(db, "items"));
    if (!existing.empty) throw new Error("O estoque já possui produtos.");
    const batch = writeBatch(db);
    INITIAL_STOCK.forEach((item) => batch.set(doc(db, "items", slugify(item.name)), { ...item, costLots: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await batch.commit(); showToast(`${INITIAL_STOCK.length} produtos importados com sucesso.`);
  } catch (error) { showToast(error.message || "Não foi possível importar os produtos.", "error"); }
  finally { button.disabled = false; button.textContent = "Importar produtos"; }
}

function renderInventory() {
  const search = $("#search-input").value.trim().toLocaleLowerCase("pt-BR");
  const lowOnly = $("#low-filter").checked;
  const items = state.items.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(search) && (!lowOnly || item.quantity <= item.lowStockThreshold));
  $("#total-units").textContent = state.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0).toLocaleString("pt-BR");
  $("#total-products").textContent = state.items.length.toLocaleString("pt-BR");
  $("#low-products").textContent = state.items.filter((item) => item.quantity <= item.lowStockThreshold).length.toLocaleString("pt-BR");
  $("#empty-inventory").classList.toggle("hidden", state.items.length !== 0);
  $("#no-results").classList.toggle("hidden", state.items.length === 0 || items.length !== 0);
  $("#products-list").innerHTML = items.map((item) => {
    const low = item.quantity <= item.lowStockThreshold;
    const cost = Number.isInteger(item.lastPurchaseCostCents) ? `Última compra: ${formatMoney(item.lastPurchaseCostCents)}` : "Custo de compra não informado";
    const sale = Number.isInteger(item.salePriceCents) ? `Venda: ${formatMoney(item.salePriceCents)}` : "Venda não informada";
    return `<article class="product-row">
      <div><p class="product-name">${escapeHtml(item.name)}</p><p class="product-meta">${cost} · ${sale}</p><p class="product-meta">Limite baixo: ${item.lowStockThreshold} un.${uncostedQuantity(item) ? ` · <span class="cost-pending">${uncostedQuantity(item)} un. sem custo</span>` : ""}</p></div>
      <div class="stock-count"><strong>${item.quantity}</strong><span>unidades</span>${low ? '<span class="low-badge">Estoque baixo</span>' : ""}</div>
      <div class="row-actions">
        <button class="move-button config" type="button" data-id="${escapeHtml(item.id)}">⚙</button>
        <button class="move-button in" type="button" data-id="${escapeHtml(item.id)}" data-kind="entrada">+ Compra</button>
        <button class="move-button out" type="button" data-id="${escapeHtml(item.id)}" data-kind="saida">− Venda</button>
      </div></article>`;
  }).join("");
  $$(".move-button[data-kind]").forEach((button) => button.addEventListener("click", () => openMovement(button.dataset.id, button.dataset.kind)));
  $$(".move-button.config").forEach((button) => button.addEventListener("click", () => openProduct(button.dataset.id)));
}

function renderHistory() {
  $("#empty-history").classList.toggle("hidden", state.movements.length !== 0);
  $("#history-list").classList.toggle("hidden", state.movements.length === 0);
  $("#history-list").innerHTML = state.movements.map((movement) => {
    const financial = movement.kind === "entrada" && Number.isInteger(movement.unitCostCents) ? `${formatMoney(movement.unitCostCents)}/un.` : movement.kind === "saida" && Number.isInteger(movement.totalRevenueCents) ? `Venda ${formatMoney(movement.totalRevenueCents)}` : "";
    const kindLabel = movement.kind === "entrada" ? (Number.isInteger(movement.unitCostCents) ? "Compra" : "Entrada") : (Number.isInteger(movement.totalRevenueCents) ? "Venda" : "Saída");
    return `<article class="history-row"><span class="kind-badge ${movement.kind}">${kindLabel}</span>
      <div><div class="history-product">${escapeHtml(movement.itemName)}</div><div class="history-note">${escapeHtml(movement.note || "Sem observação")}</div></div>
      <div><div class="history-quantity">${movement.kind === "entrada" ? "+" : "−"}${movement.quantity} un.</div><div class="history-user">${escapeHtml(financial || movement.userEmail || "Usuário")}</div></div>
      <div class="history-date">${formatDate(movement.createdAt)}</div></article>`;
  }).join("");
}

function openMovement(itemId, kind) {
  const item = state.items.find((candidate) => candidate.id === itemId); if (!item) return;
  $("#movement-form").reset(); $("#movement-item-id").value = item.id; $("#movement-kind").value = kind;
  $("#movement-kind-label").textContent = kind === "entrada" ? "Registrar compra" : "Registrar venda";
  $("#movement-product").textContent = item.name; $("#movement-current").textContent = `${item.quantity} unidades`;
  $("#movement-price-label").textContent = kind === "entrada" ? "Valor unitário de compra" : "Valor unitário de venda";
  $("#movement-price").value = kind === "saida" ? inputMoney(item.salePriceCents) : "";
  $("#movement-note").placeholder = kind === "entrada" ? "Ex.: fornecedor ou número da nota" : "Ex.: cliente ou forma de pagamento";
  $("#confirm-movement").textContent = kind === "entrada" ? "Confirmar compra" : "Confirmar venda";
  $("#purchase-comparison").classList.add("hidden"); $("#movement-error").textContent = "";
  $("#movement-dialog").showModal(); setTimeout(() => $("#movement-quantity").focus(), 50);
}

function updatePurchaseComparison() {
  if ($("#movement-kind").value !== "entrada") return $("#purchase-comparison").classList.add("hidden");
  const item = state.items.find((candidate) => candidate.id === $("#movement-item-id").value);
  const current = parseMoney($("#movement-price").value);
  if (!item || !Number.isInteger(item.lastPurchaseCostCents) || !Number.isInteger(current) || current === item.lastPurchaseCostCents) return $("#purchase-comparison").classList.add("hidden");
  const difference = current - item.lastPurchaseCostCents;
  const percent = Math.abs(difference / item.lastPurchaseCostCents * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const comparison = $("#purchase-comparison"); comparison.classList.remove("hidden", "good", "bad"); comparison.classList.add(difference < 0 ? "good" : "bad");
  comparison.textContent = difference < 0 ? `Promoção: ${formatMoney(Math.abs(difference))} (${percent}%) mais barato que a última compra.` : `${formatMoney(difference)} (${percent}%) mais caro que a última compra.`;
}

async function submitMovement(event, db) {
  event.preventDefault();
  const itemId = $("#movement-item-id").value, kind = $("#movement-kind").value;
  const quantity = Number.parseInt($("#movement-quantity").value, 10), priceCents = parseMoney($("#movement-price").value), note = $("#movement-note").value.trim();
  const button = $("#confirm-movement"); $("#movement-error").textContent = "";
  if (!Number.isInteger(quantity) || quantity < 1) return void ($("#movement-error").textContent = "Informe uma quantidade inteira maior que zero.");
  if (!Number.isInteger(priceCents) || priceCents <= 0) return void ($("#movement-error").textContent = "Informe um valor unitário maior que zero.");
  button.disabled = true; button.textContent = "Salvando...";
  try {
    const itemRef = doc(db, "items", itemId), movementRef = doc(collection(db, "movements"));
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(itemRef); if (!snapshot.exists()) throw new Error("Produto não encontrado.");
      const item = snapshot.data(), before = Number(item.quantity), after = kind === "entrada" ? before + quantity : before - quantity;
      if (after < 0) throw new Error(`Há somente ${before} unidades disponíveis.`);
      let lots = [...(item.costLots || [])], itemUpdate, financial;
      if (kind === "entrada") {
        lots.push({ quantity, unitCostCents: priceCents, movementId: movementRef.id });
        itemUpdate = { quantity: after, costLots: lots, lastPurchaseCostCents: priceCents, updatedAt: serverTimestamp(), lastMovementId: movementRef.id };
        financial = { unitCostCents: priceCents, totalCostCents: priceCents * quantity };
      } else {
        let remaining = quantity, unknown = Math.min(remaining, Math.max(0, before - knownLotQuantity(item))), totalCostCents = 0;
        remaining -= unknown;
        lots = lots.map((lot) => {
          if (!remaining || !lot.quantity) return lot;
          const used = Math.min(remaining, lot.quantity); remaining -= used; totalCostCents += used * lot.unitCostCents;
          return { ...lot, quantity: lot.quantity - used };
        }).filter((lot) => lot.quantity > 0);
        itemUpdate = { quantity: after, costLots: lots, salePriceCents: priceCents, updatedAt: serverTimestamp(), lastMovementId: movementRef.id };
        financial = { salePriceCents: priceCents, totalRevenueCents: priceCents * quantity, totalCostCents, uncostedQuantity: unknown };
      }
      transaction.update(itemRef, itemUpdate);
      transaction.set(movementRef, { itemId, itemName: item.name, kind, quantity, before, after, note, ...financial, uid: state.user.uid, userEmail: state.user.email || "", createdAt: serverTimestamp() });
    });
    $("#movement-dialog").close(); showToast(kind === "entrada" ? "Compra registrada e lote PEPS criado." : "Venda registrada.");
  } catch (error) { $("#movement-error").textContent = error.message || "Não foi possível registrar a movimentação."; }
  finally { button.disabled = false; button.textContent = kind === "entrada" ? "Confirmar compra" : "Confirmar venda"; }
}

function openProduct(itemId = "") {
  const item = itemId ? state.items.find((candidate) => candidate.id === itemId) : null; if (itemId && !item) return;
  $("#product-form").reset(); $("#product-item-id").value = item?.id || "";
  $("#product-dialog-eyebrow").textContent = item ? "Editar produto" : "Cadastrar produto";
  $("#product-dialog-name").textContent = item?.name || "Novo produto";
  $("#product-current-stock").classList.toggle("hidden", !item);
  $("#product-current-quantity").textContent = `${Number(item?.quantity || 0).toLocaleString("pt-BR")} ${item?.quantity === 1 ? "unidade" : "unidades"}`;
  $("#product-name").value = item?.name || ""; $("#product-low-threshold").value = item?.lowStockThreshold ?? 2;
  $("#product-sale-price").value = inputMoney(item?.salePriceCents); $("#product-error").textContent = "";
  const pending = item ? uncostedQuantity(item) : 0; $("#initial-cost-field").classList.toggle("hidden", !item || pending === 0);
  $("#initial-cost-field .field-help").textContent = `Este custo será aplicado às ${pending} unidades atuais ainda sem custo.`;
  $("#delete-product").classList.toggle("hidden", !item); $("#delete-product").disabled = Boolean(item?.quantity);
  $("#delete-product").title = item?.quantity ? "Zere o saldo antes de excluir" : "Excluir produto";
  $("#product-dialog").showModal();
}

async function saveProduct(event, db) {
  event.preventDefault();
  const itemId = $("#product-item-id").value, name = $("#product-name").value.trim(), lowStockThreshold = Number.parseInt($("#product-low-threshold").value, 10);
  const salePriceCents = parseMoney($("#product-sale-price").value), initialCostCents = parseMoney($("#product-initial-cost").value);
  const button = $("#save-product"); $("#product-error").textContent = "";
  if (!name) return void ($("#product-error").textContent = "Informe o nome do produto.");
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) return void ($("#product-error").textContent = "Informe um limite inteiro igual ou maior que zero.");
  if (salePriceCents !== null && (!Number.isInteger(salePriceCents) || salePriceCents <= 0)) return void ($("#product-error").textContent = "Informe um preço de venda válido.");
  if (initialCostCents !== null && (!Number.isInteger(initialCostCents) || initialCostCents <= 0)) return void ($("#product-error").textContent = "Informe um custo inicial válido.");
  button.disabled = true; button.textContent = "Salvando...";
  try {
    const duplicate = state.items.some((item) => item.id !== itemId && item.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0);
    if (duplicate) throw new Error("Já existe um produto com esse nome.");
    if (!itemId) {
      const itemRef = doc(collection(db, "items")), data = { name, quantity: 0, lowStockThreshold, costLots: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      if (salePriceCents !== null) data.salePriceCents = salePriceCents;
      const batch = writeBatch(db); batch.set(itemRef, data); await batch.commit();
      $("#product-dialog").close(); showToast("Produto cadastrado."); return;
    }
    await runTransaction(db, async (transaction) => {
      const itemRef = doc(db, "items", itemId), snapshot = await transaction.get(itemRef); if (!snapshot.exists()) throw new Error("Produto não encontrado.");
      const item = snapshot.data(), pending = uncostedQuantity(item), update = { name, lowStockThreshold, costLots: item.costLots || [], updatedAt: serverTimestamp() };
      if (salePriceCents !== null) update.salePriceCents = salePriceCents;
      if (initialCostCents !== null && pending > 0) {
        update.costLots = [{ quantity: pending, unitCostCents: initialCostCents, movementId: "estoque-inicial" }, ...(item.costLots || [])];
        if (!Number.isInteger(item.lastPurchaseCostCents)) update.lastPurchaseCostCents = initialCostCents;
      }
      transaction.update(itemRef, update);
    });
    $("#product-dialog").close(); showToast("Produto atualizado.");
  } catch (error) { $("#product-error").textContent = error.message || "Não foi possível atualizar o produto."; }
  finally { button.disabled = false; button.textContent = "Salvar"; }
}

async function deleteProduct(db) {
  const itemId = $("#product-item-id").value, item = state.items.find((candidate) => candidate.id === itemId); if (!item) return;
  if (item.quantity !== 0) return void ($("#product-error").textContent = "Zere o saldo do produto antes de excluí-lo.");
  if (!window.confirm(`Excluir “${item.name}”? O histórico de movimentações será preservado.`)) return;
  const button = $("#delete-product"); button.disabled = true; button.textContent = "Excluindo...";
  try {
    await runTransaction(db, async (transaction) => {
      const itemRef = doc(db, "items", itemId), snapshot = await transaction.get(itemRef);
      if (!snapshot.exists()) throw new Error("Produto não encontrado.");
      if (snapshot.data().quantity !== 0) throw new Error("Zere o saldo do produto antes de excluí-lo.");
      transaction.delete(itemRef);
    });
    $("#product-dialog").close(); showToast("Produto excluído.");
  } catch (error) { $("#product-error").textContent = error.message || "Não foi possível excluir o produto."; }
  finally { button.disabled = false; button.textContent = "Excluir"; }
}

function reportStart(period) {
  const now = new Date(), start = new Date(now); start.setHours(0, 0, 0, 0);
  if (period === "week") { const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day); }
  if (period === "month") start.setDate(1);
  return start;
}
function reportSales() { const start = reportStart(state.reportPeriod); return state.movements.filter((movement) => movement.kind === "saida" && Number.isInteger(movement.totalRevenueCents) && movement.createdAt?.toDate?.() >= start); }
function renderReport() {
  const sales = reportSales(), units = sales.reduce((sum, sale) => sum + sale.quantity, 0), revenue = sales.reduce((sum, sale) => sum + sale.totalRevenueCents, 0), cost = sales.reduce((sum, sale) => sum + sale.totalCostCents, 0), unknown = sales.reduce((sum, sale) => sum + Number(sale.uncostedQuantity || 0), 0);
  $("#report-units").textContent = units.toLocaleString("pt-BR"); $("#report-revenue").textContent = formatMoney(revenue); $("#report-cost").textContent = formatMoney(cost); $("#report-profit").textContent = unknown ? "Incompleto" : formatMoney(revenue - cost);
  $("#report-warning").classList.toggle("hidden", unknown === 0); $("#report-warning").textContent = unknown ? `${unknown} unidade(s) vendida(s) não tinham custo informado. O custo e o lucro do período estão incompletos.` : "";
  const grouped = new Map(); sales.forEach((sale) => { const row = grouped.get(sale.itemId) || { name: sale.itemName, quantity: 0, revenue: 0, cost: 0, unknown: 0 }; row.quantity += sale.quantity; row.revenue += sale.totalRevenueCents; row.cost += sale.totalCostCents; row.unknown += Number(sale.uncostedQuantity || 0); grouped.set(sale.itemId, row); });
  $("#report-list").innerHTML = [...grouped.values()].map((row) => `<article class="report-row"><strong>${escapeHtml(row.name)}</strong><span>${row.quantity} un.</span><span>${formatMoney(row.revenue)} faturados</span><span>${row.unknown ? "Custo incompleto" : `${formatMoney(row.revenue - row.cost)} de lucro`}</span></article>`).join("");
  $("#empty-report").classList.toggle("hidden", sales.length !== 0); $("#report-list").classList.toggle("hidden", sales.length === 0);
}

function downloadCsv(filename, rows) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`, csv = `\uFEFF${rows.map((row) => row.map(quote).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
function exportInventory() {
  if (!state.items.length) return showToast("Não há produtos para exportar.", "error");
  downloadCsv(`estoque-vet-${new Date().toISOString().slice(0, 10)}.csv`, [["Produto", "Quantidade", "Última compra", "Preço de venda", "Unidades sem custo", "Limite baixo"], ...state.items.map((item) => [item.name, item.quantity, Number.isInteger(item.lastPurchaseCostCents) ? formatMoney(item.lastPurchaseCostCents) : "", Number.isInteger(item.salePriceCents) ? formatMoney(item.salePriceCents) : "", uncostedQuantity(item), item.lowStockThreshold])]);
}
function exportReport() {
  const sales = reportSales(); if (!sales.length) return showToast("Não há vendas neste período.", "error");
  downloadCsv(`vendas-${state.reportPeriod}-${new Date().toISOString().slice(0, 10)}.csv`, [["Data", "Produto", "Quantidade", "Preço unitário", "Faturamento", "Custo PEPS", "Lucro bruto", "Unidades sem custo"], ...sales.map((sale) => [formatDate(sale.createdAt), sale.itemName, sale.quantity, formatMoney(sale.salePriceCents), formatMoney(sale.totalRevenueCents), formatMoney(sale.totalCostCents), sale.uncostedQuantity ? "Incompleto" : formatMoney(sale.totalRevenueCents - sale.totalCostCents), sale.uncostedQuantity || 0])]);
}

$("#search-input").addEventListener("input", renderInventory); $("#low-filter").addEventListener("change", renderInventory);
$("#export-button").addEventListener("click", exportInventory); $("#export-report-button").addEventListener("click", exportReport); $("#movement-price").addEventListener("input", updatePurchaseComparison);
$("#close-dialog").addEventListener("click", () => $("#movement-dialog").close()); $("#cancel-movement").addEventListener("click", () => $("#movement-dialog").close());
$("#close-product-dialog").addEventListener("click", () => $("#product-dialog").close()); $("#cancel-product").addEventListener("click", () => $("#product-dialog").close());
$$(".period-button").forEach((button) => button.addEventListener("click", () => { state.reportPeriod = button.dataset.period; $$(".period-button").forEach((candidate) => candidate.classList.toggle("active", candidate === button)); renderReport(); }));
$$(".tab").forEach((tab) => tab.addEventListener("click", () => { $$(".tab").forEach((candidate) => candidate.classList.toggle("active", candidate === tab)); ["inventory", "history", "reports"].forEach((panel) => $(`#${panel}-panel`).classList.toggle("hidden", tab.dataset.tab !== panel)); }));
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
