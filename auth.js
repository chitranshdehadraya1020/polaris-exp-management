/* =====================================
   POLAROPS AUTHENTICATION JAVASCRIPT
   ===================================== */


/* -------------------------------------
   FORM SWITCHING
   ------------------------------------- */

function showForm(formId) {

    const forms = document.querySelectorAll(".auth-form");

    forms.forEach(function(form) {
        form.classList.remove("active");
    });

    const selectedForm = document.getElementById(formId);

    if (selectedForm) {
        selectedForm.classList.add("active");
    }

    clearMessage();
}


/* -------------------------------------
   PASSWORD SHOW / HIDE
   ------------------------------------- */

function togglePassword(inputId, button) {

    const input = document.getElementById(inputId);

    if (input.type === "password") {

        input.type = "text";

        button.textContent = "🙈";

    } else {

        input.type = "password";

        button.textContent = "👁";
    }
}


/* -------------------------------------
   MESSAGE SYSTEM
   ------------------------------------- */

function showMessage(message, type) {

    const messageBox = document.getElementById("message");

    messageBox.textContent = message;

    messageBox.className = type;

    messageBox.style.display = "block";
}


function clearMessage() {

    const messageBox = document.getElementById("message");

    messageBox.textContent = "";

    messageBox.className = "";

    messageBox.style.display = "none";
}


/* -------------------------------------
   REGISTER
   ------------------------------------- */

function registerUser(event) {

    event.preventDefault();

    const name =
        document.getElementById("registerName").value.trim();

    const email =
        document.getElementById("registerEmail").value.trim();

    const role =
        document.getElementById("registerRole").value;

    const password =
        document.getElementById("registerPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;


    /* Password validation */

    if (password.length < 8) {

        showMessage(
            "Password must contain at least 8 characters.",
            "error"
        );

        return;
    }


    /* Confirm password */

    if (password !== confirmPassword) {

        showMessage(
            "Passwords do not match.",
            "error"
        );

        return;
    }


    /* Register against the real backend (replaces localStorage) */

    fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, password }),
    })
        .then(async (res) => {
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.error || "Registration failed.");
            }
            return body;
        })
        .then(() => {
            showMessage(
                "Account created successfully. Redirecting to login...",
                "success"
            );

            document.querySelector("#registerForm form").reset();

            setTimeout(function() {
                showForm("loginForm");
            }, 1500);
        })
        .catch((err) => {
            showMessage(err.message, "error");
        });
}


/* -------------------------------------
   LOGIN
   ------------------------------------- */

function loginUser(event) {

    event.preventDefault();

    const email =
        document.getElementById("loginEmail").value.trim();

    const password =
        document.getElementById("loginPassword").value;


    /* Log in against the real backend (replaces localStorage).
       The backend sets a signed session cookie on success. */

    fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    })
        .then(async (res) => {
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.error || "Invalid email or password.");
            }
            return body;
        })
        .then((body) => {
            /* Keep a light client-side copy for UI display only --
               the real session lives in the secure cookie set by Flask. */
            sessionStorage.setItem("polarLoggedIn", "true");
            sessionStorage.setItem("polarUser", JSON.stringify(body.user));

            showMessage(
                "Login successful. Opening control center...",
                "success"
            );

            /*
               Change this URL to your existing dashboard page.
               If your main dashboard is index.html,
               keep it as index.html.
            */

            setTimeout(function() {
                window.location.href = "index.html";
            }, 1000);
        })
        .catch((err) => {
            showMessage(err.message, "error");
        });
}


/* -------------------------------------
   FORGOT PASSWORD
   ------------------------------------- */

function forgotPassword(event) {

    event.preventDefault();

    const email =
        document.getElementById("forgotEmail").value.trim();


    const users =
        JSON.parse(localStorage.getItem("polarUsers")) || [];


    const user = users.find(function(user) {

        return user.email === email;

    });


    if (!user) {

        showMessage(
            "No account was found with this email address.",
            "error"
        );

        return;
    }


    /*
       Front-end demonstration only.
       A real application should send a
       secure password-reset email from
       the backend.
    */

    showMessage(
        "Password reset instructions have been sent to your registered email.",
        "success"
    );


    document.getElementById("forgotEmail").value = "";
}


/* -------------------------------------
   ENTER KEY SUPPORT
   ------------------------------------- */

document.addEventListener("keydown", function(event) {

    if (event.key === "Escape") {

        clearMessage();

    }

});