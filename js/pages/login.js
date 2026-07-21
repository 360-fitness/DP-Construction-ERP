import { login, resetPassword } from "../services/auth-service.js";
import { auth } from "../firebase/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { isValidEmail } from "../utils/validators.js";
import { showToast } from "../utils/toast.js";

const form = document.getElementById("login-form");
const errorBox = document.getElementById("auth-error");
const loginBtn = document.getElementById("login-btn");
const forgotLink = document.getElementById("forgot-link");

// If already signed in, skip straight to the dashboard.
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "dashboard.html";
});

const params = new URLSearchParams(window.location.search);
if (params.get("error") === "no-profile") {
  showError("Your account has no company profile set up yet. Contact your administrator.");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;

  if (!isValidEmail(email)) {
    showError("Please enter a valid email address.");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in…";

  try {
    await login(email, password, remember);
    window.location.href = "dashboard.html";
  } catch (err) {
    showError(mapAuthError(err.code));
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
});

forgotLink.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  if (!isValidEmail(email)) {
    showError("Enter your email address above first, then click 'Forgot password?' again.");
    return;
  }
  try {
    await resetPassword(email);
    showToast("Password reset email sent. Check your inbox.", "success");
  } catch (err) {
    showError(mapAuthError(err.code));
  }
});

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("is-visible");
}
function hideError() {
  errorBox.classList.remove("is-visible");
}

function mapAuthError(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    default:
      return "Something went wrong signing in. Please try again.";
  }
}
