import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDPKT5bYhadiJpvI6sPw2rfBIjt8wMAPyQ",
  authDomain: "quran-32fac.firebaseapp.com",
  projectId: "quran-32fac",
  storageBucket: "quran-32fac.firebasestorage.app",
  messagingSenderId: "878077024112",
  appId: "1:878077024112:web:47326260fd9d2d93d7e1b5",
  measurementId: "G-YGVQF32KCB"
};

// Admin email
const ADMIN_EMAIL = "sf495766@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

let currentAdmin = null;
let isLoadingRequests = false;
let isReviewingRequest = false;

// Allowed subscription packages
const allowedPlans = {
  7: 10,
  14: 20,
  30: 50
};

// Display messages
function showMessage(id, message, error = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = error ? "#b00020" : "#126747";
}

// Format dates
function formatDate(value) {
  if (!value) return "دستیاب نہیں";

  const date = typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "دستیاب نہیں";
  }

  return date.toLocaleDateString("ur-PK", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

// Auth error messages
function readableError(error) {
  const messages = {
    "auth/invalid-credential": "ای میل یا پاس ورڈ درست نہیں۔",
    "auth/user-not-found": "یہ ایڈمن اکاؤنٹ موجود نہیں۔",
    "auth/wrong-password": "پاس ورڈ درست نہیں۔",
    "auth/invalid-email": "ای میل درست نہیں۔",
    "auth/network-request-failed": "انٹرنیٹ کنکشن چیک کریں۔",
    "permission-denied": "اجازت نہیں ملی۔ Firestore Rules چیک کریں۔"
  };

  return messages[error.code] ||
    error.message ||
    "ایک مسئلہ پیش آیا۔";
}

// Confirm admin account
function isAuthorizedAdmin(user) {
  return Boolean(
    user &&
    user.email &&
    user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}

// Toggle login and dashboard
function setAdminView(isAdmin) {
  if ($("adminLogin")) {
    $("adminLogin").hidden = isAdmin;
  }

  if ($("dashboard")) {
    $("dashboard").hidden = !isAdmin;
  }
}

// Admin login
async function adminLogin() {
  const email = $("adminEmail")?.value.trim();
  const password = $("adminPassword")?.value;

  if (!email || !password) {
    showMessage(
      "adminMsg",
      "ایڈمن ای میل اور پاس ورڈ درج کریں۔",
      true
    );
    return;
  }

  const button = $("adminLoginBtn");
  if (button) button.disabled = true;

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (!isAuthorizedAdmin(credential.user)) {
      await signOut(auth);

      currentAdmin = null;
      setAdminView(false);

      showMessage(
        "adminMsg",
        "اس اکاؤنٹ کو ایڈمن کی اجازت نہیں ہے۔",
        true
      );

      return;
    }

    currentAdmin = credential.user;
    setAdminView(true);

    showMessage("adminMsg", "ایڈمن لاگ اِن کامیاب ہے۔");

    await loadRequests();
  } catch (error) {
    console.error("Admin login error:", error);

    showMessage(
      "adminMsg",
      readableError(error),
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}

// Admin logout
async function adminLogout() {
  try {
    await signOut(auth);

    currentAdmin = null;
    setAdminView(false);

    showMessage("adminMsg", "آپ لاگ آؤٹ ہو گئے ہیں۔");
  } catch (error) {
    console.error("Admin logout error:", error);

    showMessage(
      "dashboardMsg",
      readableError(error),
      true
    );
  }
}

// Load payment requests
async function loadRequests() {
  if (!isAuthorizedAdmin(currentAdmin)) {
    showMessage(
      "dashboardMsg",
      "صرف مجاز ایڈمن درخواستیں دیکھ سکتا ہے۔",
      true
    );
    return;
  }

  if (isLoadingRequests) return;
  isLoadingRequests = true;

  const list = $("requestsList");

  if (!list) {
    showMessage(
      "dashboardMsg",
      "HTML میں requestsList موجود نہیں ہے۔",
      true
    );
    isLoadingRequests = false;
    return;
  }

  list.textContent = "درخواستیں لوڈ ہو رہی ہیں…";

  try {
    const snapshot = await getDocs(
      collection(db, "paymentRequests")
    );

    list.innerHTML = "";

    if (snapshot.empty) {
      list.textContent = "ابھی کوئی ادائیگی درخواست موجود نہیں۔";
      showMessage("dashboardMsg", "کوئی درخواست موجود نہیں۔");
      return;
    }

    const requests = [];

    snapshot.forEach(requestDoc => {
      requests.push({
        id: requestDoc.id,
        data: requestDoc.data()
      });
    });

    // Newest requests first
    requests.sort((a, b) => {
      const aTime = a.data.createdAt?.toMillis?.() || 0;
      const bTime = b.data.createdAt?.toMillis?.() || 0;

      return bTime - aTime;
    });

    for (const request of requests) {
      const data = request.data;

      const card = document.createElement("div");
      card.className = "request";

      const email = document.createElement("p");
      email.textContent = `ای میل: ${data.email || "دستیاب نہیں"}`;

      const packageInfo = document.createElement("p");
      packageInfo.textContent =
        `پیکیج: ${data.days || 0} دن، ${data.price || 0} روپے`;

      const paymentMethod = document.createElement("p");
      paymentMethod.textContent =
        `ادائیگی کا طریقہ: ${data.method || "دستیاب نہیں"}`;

      const transaction = document.createElement("p");
      transaction.textContent =
        `ٹرانزیکشن نمبر: ${data.transactionId || "دستیاب نہیں"}`;

      const requestDate = document.createElement("p");
      requestDate.textContent =
        `درخواست کی تاریخ: ${formatDate(data.createdAt)}`;

      const status = document.createElement("p");
      status.textContent =
        `حیثیت: ${data.status || "pending"}`;

      card.append(
        email,
        packageInfo,
        paymentMethod,
        transaction,
        requestDate,
        status
      );

      if ((data.status || "pending") === "pending") {
        const approveButton = document.createElement("button");

        approveButton.type = "button";
        approveButton.textContent = "ادائیگی منظور کریں";

        approveButton.addEventListener("click", () => {
          reviewRequest(request.id, "approved");
        });

        const rejectButton = document.createElement("button");

        rejectButton.type = "button";
        rejectButton.textContent = "درخواست رد کریں";

        rejectButton.addEventListener("click", () => {
          reviewRequest(request.id, "rejected");
        });

        card.append(approveButton, rejectButton);
      } else {
        const result = document.createElement("p");

        result.textContent =
          data.status === "approved"
            ? "یہ ادائیگی منظور ہو چکی ہے۔"
            : "یہ درخواست رد ہو چکی ہے۔";

        card.appendChild(result);
      }

      list.appendChild(card);
    }

    showMessage(
      "dashboardMsg",
      "درخواستیں کامیابی سے لوڈ ہو گئی ہیں۔"
    );
  } catch (error) {
    console.error("Load requests error:", error);

    list.textContent = "درخواستیں لوڈ نہیں ہو سکیں۔";

    showMessage(
      "dashboardMsg",
      readableError(error),
      true
    );
  } finally {
    isLoadingRequests = false;
  }
}

// Approve or reject a payment request
async function reviewRequest(requestId, decision) {
  if (!isAuthorizedAdmin(currentAdmin)) {
    showMessage(
      "dashboardMsg",
      "آپ کو یہ کارروائی کرنے کی اجازت نہیں۔",
      true
    );
    return;
  }

  if (isReviewingRequest) return;

  if (!["approved", "rejected"].includes(decision)) {
    return;
  }

  const confirmation = decision === "approved"
    ? "کیا آپ نے واقعی اس صارف کی ادائیگی وصول کر لی ہے؟"
    : "کیا آپ واقعی اس ادائیگی درخواست کو رد کرنا چاہتے ہیں؟";

  if (!confirm(confirmation)) return;

  isReviewingRequest = true;

  try {
    const requestRef = doc(
      db,
      "paymentRequests",
      requestId
    );

    // Read the latest request data before acting
    const requestSnapshot = await getDoc(requestRef);

    if (!requestSnapshot.exists()) {
      showMessage(
        "dashboardMsg",
        "یہ ادائیگی درخواست موجود نہیں ہے۔",
        true
      );
      return;
    }

    const data = requestSnapshot.data();

    if ((data.status || "pending") !== "pending") {
      showMessage(
        "dashboardMsg",
        "اس درخواست پر پہلے ہی کارروائی ہو چکی ہے۔",
        true
      );

      await loadRequests();
      return;
    }

    if (decision === "approved") {
      const days = Number(data.days);
      const expectedPrice = allowedPlans[days];

      if (!data.uid || !expectedPrice) {
        showMessage(
          "dashboardMsg",
          "درخواست میں صارف یا پیکیج کی معلومات درست نہیں۔",
          true
        );
        return;
      }

      if (Number(data.price) !== expectedPrice) {
        showMessage(
          "dashboardMsg",
          "درخواست کی قیمت پیکیج کی مقررہ قیمت سے مختلف ہے۔",
          true
        );
        return;
      }

      await activateSubscription(data, days);
    }

    // Update request status after subscription save succeeds
    await updateDoc(requestRef, {
      status: decision,
      reviewedAt: Timestamp.now(),
      reviewedBy: currentAdmin.email || ADMIN_EMAIL
    });

    showMessage(
      "dashboardMsg",
      decision === "approved"
        ? "ادائیگی منظور ہو گئی اور سبسکرپشن محفوظ ہو گئی۔"
        : "ادائیگی درخواست رد کر دی گئی۔"
    );

    await loadRequests();
  } catch (error) {
    console.error("Review request error:", error);

    showMessage(
      "dashboardMsg",
      `درخواست مکمل نہیں ہو سکی: ${readableError(error)}`,
      true
    );
  } finally {
    isReviewingRequest = false;
  }
}

// Activate or extend a subscription
async function activateSubscription(data, days) {
  const subscriptionRef = doc(
    db,
    "subscriptions",
    data.uid
  );

  const oldSnapshot = await getDoc(subscriptionRef);

  const now = new Date();

  // New subscription starts when the admin approves payment
  let effectiveStart = now;
  let startedAtValue = Timestamp.fromDate(now);

  if (oldSnapshot.exists()) {
    const oldData = oldSnapshot.data();

    const oldExpiry = oldData.expiresAt?.toDate?.();

    if (oldExpiry && oldExpiry > now) {
      // Extend an existing active subscription after its expiry
      effectiveStart = oldExpiry;

      // Preserve the original start date of the active subscription
      if (oldData.startedAt) {
        startedAtValue = oldData.startedAt;
      }
    }
  }

  const expiryDate = new Date(effectiveStart);

  expiryDate.setDate(
    expiryDate.getDate() + days
  );

  await setDoc(
    subscriptionRef,
    {
      uid: data.uid,
      email: data.email || "",
      active: true,
      days,
      price: Number(data.price),
      startedAt: startedAtValue,
      expiresAt: Timestamp.fromDate(expiryDate),
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );
}

// Connect buttons
document.addEventListener("DOMContentLoaded", () => {
    // Admin Password Show / Hide Button
  const adminPassword = $("adminPassword");
  const toggleAdminPassword = $("toggleAdminPassword");

  toggleAdminPassword?.addEventListener("click", () => {
    if (!adminPassword) return;

    const isPasswordHidden =
      adminPassword.type === "password";

    adminPassword.type = isPasswordHidden
      ? "text"
      : "password";

    toggleAdminPassword.textContent = isPasswordHidden
      ? "🙈"
      : "👁️";

    toggleAdminPassword.setAttribute(
      "aria-pressed",
      String(isPasswordHidden)
    );

    toggleAdminPassword.setAttribute(
      "aria-label",
      isPasswordHidden
        ? "پاس ورڈ چھپائیں"
        : "پاس ورڈ دکھائیں"
    );
  });
  $("adminLoginBtn")?.addEventListener("click", adminLogin);

  $("refreshRequests")?.addEventListener("click", loadRequests);

  $("adminLogout")?.addEventListener("click", adminLogout);

  // Restore the admin session after a page refresh
  onAuthStateChanged(auth, async user => {
    if (isAuthorizedAdmin(user)) {
      currentAdmin = user;

      setAdminView(true);

      await loadRequests();
    } else {
      currentAdmin = null;

      setAdminView(false);
    }
  });
});





