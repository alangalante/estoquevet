import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp,
  onSnapshot, query, orderBy, limit, runTransaction
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { INITIAL_STOCK } from "./initial-stock.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const views = ["#loading-view", "#setup-view", "#login-view", "#app-view"];
const state = { items: [], movements: [], user: null, unsubscribeItems: null, unsubscribeMovements: null };
let toastTimer;

function showView(selector) {
  views.forEach((view) => $(view).classList.toggle("hidden", view !== selector));
}

function showToast(message, type = "success") {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3500);
}

function isConfigured() {
  return firebaseConfig.apiKey && !Object.values(firebaseConfig).some((value) => String(value).includes("COLE_AQUI"));
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  })[char]);
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short"
  }).format(timestamp.toDate());
}

function authErrorMessage(code) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
    "auth/network-request-failed": "Sem conexão. Verifique sua internet."
  };
  return messages[code] || "Não foi possível entrar. Tente novamente.";
}

if (!isConfigured()) {
  showView("#setup-view");
} else {
  startFirebase();
}

function startFirebase() {
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);

  onAuthStateChanged(auth, (user) => {
    state.user = user;
    if (!user) {
      stopListeners();
      showView("#login-view");
      return;
    }
    $("#user-email").textContent = user.email || "Usuário";
    showView("#app-view");
    startListeners(db);
  });

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    $("#login-error").textContent = "";
    button.disabled = true;
    button.textContent = "Entrando...";
    try {
      await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value);
      event.currentTarget.reset();
    } catch (error) {
      $("#login-error").textContent = authErrorMessage(error.code);
    } finally {
      button.disabled = false;
      button.textContent = "Entrar";
    }
  });

  $("#logout-button").addEventListener("click", () => signOut(auth));
  $("#seed-button").addEventListener("click", () => seedInventory(db));
  $("#movement-form").addEventListener("submit", (event) => submitMovement(event, db));
}

function stopListeners() {
  state.unsubscribeItems?.();
  state.unsubscribeMovements?.();
  state.unsubscribeItems = null;
  state.unsubscribeMovements = null;
}

function startListeners(db) {
  stopListeners();
  state.unsubscribeItems = onSnapshot(
    query(collection(db, "items"), orderBy("name")),
    (snapshot) => {
      state.items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderInventory();
    },
    () => showToast("Não foi possível carregar o estoque. Confira as regras do Firestore.", "error")
  );
  state.unsubscribeMovements = onSnapshot(
    query(collection(db, "movements"), orderBy("createdAt", "desc"), limit(100)),
    (snapshot) => {
      state.movements = snapshot.docs.map((movement) => ({ id: movement.id, ...movement.data() }));
      renderHistory();
    },
    () => showToast("Não foi possível carregar o histórico.", "error")
  );
}

async function seedInventory(db) {
  const button = $("#seed-button");
  button.disabled = true;
  button.textContent = "Importando...";
  try {
    const existing = await getDocs(collection(db, "items"));
    if (!existing.empty) throw new Error("O estoque já possui produtos.");
    const batch = writeBatch(db);
    INITIAL_STOCK.forEach((item) => {
      batch.set(doc(db, "items", slugify(item.name)), {
        ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
    showToast(`${INITIAL_STOCK.length} produtos importados com sucesso.`);
  } catch (error) {
    showToast(error.message || "Não foi possível importar os produtos.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Importar produtos";
  }
}

function renderInventory() {
  const search = $("#search-input").value.trim().toLocaleLowerCase("pt-BR");
  const lowOnly = $("#low-filter").checked;
  const items = state.items.filter((item) => {
    const matchesSearch = item.name.toLocaleLowerCase("pt-BR").includes(search);
    const matchesLow = !lowOnly || item.quantity <= item.lowStockThreshold;
    return matchesSearch && matchesLow;
  });
  const totalUnits = state.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const lowCount = state.items.filter((item) => item.quantity <= item.lowStockThreshold).length;
  $("#total-units").textContent = totalUnits.toLocaleString("pt-BR");
  $("#total-products").textContent = state.items.length.toLocaleString("pt-BR");
  $("#low-products").textContent = lowCount.toLocaleString("pt-BR");
  $("#empty-inventory").classList.toggle("hidden", state.items.length !== 0);
  $("#no-results").classList.toggle("hidden", state.items.length === 0 || items.length !== 0);
  $("#products-list").innerHTML = items.map((item) => {
    const low = item.quantity <= item.lowStockThreshold;
    return `<article class="product-row">
      <div><p class="product-name">${escapeHtml(item.name)}</p><p class="product-meta">Limite baixo: ${item.lowStockThreshold} un.</p></div>
      <div class="stock-count"><strong>${item.quantity}</strong><span>unidades</span>${low ? '<span class="low-badge">Estoque baixo</span>' : ""}</div>
      <div class="row-actions">
        <button class="move-button in" type="button" data-id="${escapeHtml(item.id)}" data-kind="entrada">+ Entrada</button>
        <button class="move-button out" type="button" data-id="${escapeHtml(item.id)}" data-kind="saida">− Saída</button>
      </div>
    </article>`;
  }).join("");
  $$(".move-button").forEach((button) => button.addEventListener("click", () => openMovement(button.dataset.id, button.dataset.kind)));
}

function renderHistory() {
  $("#empty-history").classList.toggle("hidden", state.movements.length !== 0);
  $("#history-list").classList.toggle("hidden", state.movements.length === 0);
  $("#history-list").innerHTML = state.movements.map((movement) => `
    <article class="history-row">
      <span class="kind-badge ${movement.kind}">${movement.kind === "entrada" ? "Entrada" : "Saída"}</span>
      <div><div class="history-product">${escapeHtml(movement.itemName)}</div><div class="history-note">${escapeHtml(movement.note || "Sem observação")}</div></div>
      <div><div class="history-quantity">${movement.kind === "entrada" ? "+" : "−"}${movement.quantity} un.</div><div class="history-user">${escapeHtml(movement.userEmail || "Usuário")}</div></div>
      <div class="history-date">${formatDate(movement.createdAt)}</div>
    </article>`).join("");
}

function openMovement(itemId, kind) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  $("#movement-form").reset();
  $("#movement-item-id").value = item.id;
  $("#movement-kind").value = kind;
  $("#movement-kind-label").textContent = kind === "entrada" ? "Dar entrada" : "Dar saída";
  $("#movement-product").textContent = item.name;
  $("#movement-current").textContent = `${item.quantity} unidades`;
  $("#confirm-movement").textContent = kind === "entrada" ? "Confirmar entrada" : "Confirmar saída";
  $("#movement-error").textContent = "";
  $("#movement-dialog").showModal();
  setTimeout(() => $("#movement-quantity").focus(), 50);
}

async function submitMovement(event, db) {
  event.preventDefault();
  const itemId = $("#movement-item-id").value;
  const kind = $("#movement-kind").value;
  const quantity = Number.parseInt($("#movement-quantity").value, 10);
  const note = $("#movement-note").value.trim();
  const button = $("#confirm-movement");
  $("#movement-error").textContent = "";
  if (!Number.isInteger(quantity) || quantity < 1) {
    $("#movement-error").textContent = "Informe uma quantidade inteira maior que zero.";
    return;
  }
  button.disabled = true;
  button.textContent = "Salvando...";
  try {
    const itemRef = doc(db, "items", itemId);
    const movementRef = doc(collection(db, "movements"));
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(itemRef);
      if (!snapshot.exists()) throw new Error("Produto não encontrado.");
      const item = snapshot.data();
      const before = Number(item.quantity);
      const after = kind === "entrada" ? before + quantity : before - quantity;
      if (after < 0) throw new Error(`Há somente ${before} unidades disponíveis.`);
      transaction.update(itemRef, { quantity: after, updatedAt: serverTimestamp(), lastMovementId: movementRef.id });
      transaction.set(movementRef, {
        itemId, itemName: item.name, kind, quantity, before, after, note,
        uid: state.user.uid, userEmail: state.user.email || "", createdAt: serverTimestamp()
      });
    });
    $("#movement-dialog").close();
    showToast(kind === "entrada" ? "Entrada registrada." : "Saída registrada.");
  } catch (error) {
    $("#movement-error").textContent = error.message || "Não foi possível registrar a movimentação.";
  } finally {
    button.disabled = false;
    button.textContent = kind === "entrada" ? "Confirmar entrada" : "Confirmar saída";
  }
}

function exportCsv() {
  if (!state.items.length) return showToast("Não há produtos para exportar.", "error");
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [["Produto", "Quantidade", "Limite de estoque baixo"], ...state.items.map((item) => [item.name, item.quantity, item.lowStockThreshold])];
  const csv = `\uFEFF${rows.map((row) => row.map(quote).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `estoque-vet-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

$("#search-input").addEventListener("input", renderInventory);
$("#low-filter").addEventListener("change", renderInventory);
$("#export-button").addEventListener("click", exportCsv);
$("#close-dialog").addEventListener("click", () => $("#movement-dialog").close());
$("#cancel-movement").addEventListener("click", () => $("#movement-dialog").close());
$$('.tab').forEach((tab) => tab.addEventListener("click", () => {
  $$(".tab").forEach((candidate) => candidate.classList.toggle("active", candidate === tab));
  $("#inventory-panel").classList.toggle("hidden", tab.dataset.tab !== "inventory");
  $("#history-panel").classList.toggle("hidden", tab.dataset.tab !== "history");
}));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
