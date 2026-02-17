// script.js
// PASTE YOUR CODESPACE URL HERE (No trailing slash)
const API_URL = "https://flashcardapp-pwic.onrender.com";
const DEFAULT_COLLECTION_COLOR = "#0F4C5C";

let flashcards = [];
let collections = [];
let currentIndex = 0;
let activeCollection = "all";
let editingCardId = null;
let pendingConfirmAction = null;
let pendingWelcomeContinue = null;

const cardQuestion = document.getElementById("card-question");
const cardAnswer = document.getElementById("card-answer");
const cardInner = document.getElementById("card-inner");
const cardIndexDisplay = document.getElementById("card-index");
const flashcardElement = document.getElementById("flashcard");
const collectionSelect = document.getElementById("collection-select");
const activeCollectionText = document.getElementById("active-collection");

const addCardModal = document.getElementById("add-card-modal");
const addCardForm = document.getElementById("add-card-form");
const addCardQuestionInput = document.getElementById("modal-question");
const addCardAnswerInput = document.getElementById("modal-answer");
const addCardCollectionName = document.getElementById("add-card-collection-name");
const addCardError = document.getElementById("add-card-error");

const collectionModal = document.getElementById("collection-modal");
const collectionForm = document.getElementById("collection-form");
const collectionNameInput = document.getElementById("collection-name-input");
const collectionClassInput = document.getElementById("collection-class-input");
const collectionColorInput = document.getElementById("collection-color-input");
const collectionColorValue = document.getElementById("collection-color-value");
const collectionError = document.getElementById("collection-error");

const editCardModal = document.getElementById("edit-card-modal");
const editCardForm = document.getElementById("edit-card-form");
const editQuestionInput = document.getElementById("edit-question");
const editAnswerInput = document.getElementById("edit-answer");
const editCardError = document.getElementById("edit-card-error");

const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmActionButton = document.getElementById("confirm-action-btn");

const welcomeModal = document.getElementById("welcome-modal");
const welcomeUserName = document.getElementById("welcome-user-name");
const welcomeContinueBtn = document.getElementById("welcome-continue-btn");
const noticeModal = document.getElementById("notice-modal");
const noticeTitle = document.getElementById("notice-title");
const noticeMessage = document.getElementById("notice-message");
const noticeOkBtn = document.getElementById("notice-ok-btn");

const modalOverlays = Array.from(document.querySelectorAll(".modal-overlay"));

document.addEventListener("DOMContentLoaded", initializeApp);

async function waitForAuthBootstrap() {
    const authReady = window.authReady;
    if (authReady && typeof authReady.then === "function") {
        try {
            await authReady;
        } catch (error) {
            console.error("Auth bootstrap failed:", error);
        }
    }
}

function getHeaders() {
    const token = localStorage.getItem("userToken");
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

function hasValidToken() {
    const token = localStorage.getItem("userToken");
    return Boolean(token && token.startsWith("ey"));
}

function getSelectedCollectionId() {
    if (activeCollection === "all") return null;
    const parsed = Number(activeCollection);
    return Number.isInteger(parsed) ? parsed : null;
}

function getCollectionDisplayName(collection) {
    if (!collection) return "All Collections";
    if (collection.class_name) return `${collection.name} (${collection.class_name})`;
    return collection.name;
}

function sanitizeCollectionColor(color) {
    const candidate = (color || "").trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(candidate)) return DEFAULT_COLLECTION_COLOR;
    return candidate.toUpperCase();
}

function toRgba(hexColor, alpha) {
    const color = sanitizeCollectionColor(hexColor).slice(1);
    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shiftHexColor(hexColor, ratio) {
    const color = sanitizeCollectionColor(hexColor).slice(1);
    const transform = (value) => {
        const normalized = parseInt(value, 16);
        const shifted = ratio >= 0
            ? normalized + (255 - normalized) * ratio
            : normalized * (1 + ratio);
        return Math.max(0, Math.min(255, Math.round(shifted)));
    };

    const r = transform(color.slice(0, 2));
    const g = transform(color.slice(2, 4));
    const b = transform(color.slice(4, 6));
    const toHex = (value) => value.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function applyCollectionTheme(color) {
    const base = sanitizeCollectionColor(color);
    const deep = shiftHexColor(base, -0.18);
    const bright = shiftHexColor(base, 0.15);
    document.documentElement.style.setProperty("--collection-color", base);
    document.documentElement.style.setProperty("--collection-color-deep", deep);
    document.documentElement.style.setProperty("--collection-color-bright", bright);
    document.documentElement.style.setProperty("--collection-soft", toRgba(base, 0.16));
}

function normalizeCollectionPayload(collection) {
    return {
        ...collection,
        color: sanitizeCollectionColor(collection?.color),
    };
}

function setModalError(element, message = "") {
    if (element) element.textContent = message;
}

function openModal(overlay) {
    if (!overlay) return;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function closeModal(overlay) {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");

    const hasOpenModal = modalOverlays.some((modal) => modal.classList.contains("is-open"));
    if (!hasOpenModal) {
        document.body.classList.remove("modal-open");
    }
}

function closeModalById(modalId) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return;

    if (modalId === "add-card-modal") {
        setModalError(addCardError);
    }

    if (modalId === "collection-modal") {
        setModalError(collectionError);
    }

    if (modalId === "edit-card-modal") {
        editingCardId = null;
        setModalError(editCardError);
    }

    if (modalId === "confirm-modal") {
        pendingConfirmAction = null;
        if (confirmActionButton) {
            confirmActionButton.classList.remove("modal-danger-btn");
            confirmActionButton.textContent = "Confirm";
            confirmActionButton.disabled = false;
        }
    }

    if (modalId === "welcome-modal") {
        const callback = pendingWelcomeContinue;
        pendingWelcomeContinue = null;
        closeModal(overlay);
        if (typeof callback === "function") callback();
        return;
    }

    closeModal(overlay);
}

function setupModalInfrastructure() {
    modalOverlays.forEach((overlay) => {
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                closeModalById(overlay.id);
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const openOverlays = modalOverlays.filter((overlay) => overlay.classList.contains("is-open"));
        if (!openOverlays.length) return;
        closeModalById(openOverlays[openOverlays.length - 1].id);
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            const modalId = button.getAttribute("data-close-modal");
            if (modalId) closeModalById(modalId);
        });
    });
}

function updateActiveCollectionLabel() {
    if (!activeCollectionText) return;
    if (activeCollection === "all") {
        activeCollectionText.textContent = "Showing: All Collections";
        applyCollectionTheme(DEFAULT_COLLECTION_COLOR);
        return;
    }

    const selected = collections.find((collection) => String(collection.id) === String(activeCollection));
    activeCollectionText.textContent = `Showing: ${getCollectionDisplayName(selected)}`;
    applyCollectionTheme(selected?.color || DEFAULT_COLLECTION_COLOR);
}

function renderCollectionOptions() {
    if (!collectionSelect) return;

    const options = ['<option value="all">All Collections</option>'];
    for (const collection of collections) {
        options.push(`<option value="${collection.id}">${getCollectionDisplayName(collection)}</option>`);
    }
    collectionSelect.innerHTML = options.join("");
    collectionSelect.value = activeCollection;
    updateActiveCollectionLabel();
}

async function initializeApp() {
    await waitForAuthBootstrap();
    setupModalInfrastructure();
    setupAddCardModal();
    setupCollectionModal();
    setupEditCardModal();
    setupConfirmModal();
    setupWelcomeModal();
    setupNoticeModal();
    renderCollectionOptions();
    await fetchCollections();
    await fetchFlashcards();
}

function setupAddCardModal() {
    if (!addCardForm) return;
    addCardForm.addEventListener("submit", handleAddCardFormSubmit);
}

function setupCollectionModal() {
    if (!collectionForm) return;
    collectionForm.addEventListener("submit", handleCollectionFormSubmit);
    if (collectionColorInput) {
        collectionColorInput.addEventListener("input", () => {
            if (collectionColorValue) {
                collectionColorValue.textContent = sanitizeCollectionColor(collectionColorInput.value);
            }
        });
    }
}

function setupEditCardModal() {
    if (!editCardForm) return;
    editCardForm.addEventListener("submit", handleEditCardFormSubmit);
}

function setupConfirmModal() {
    if (!confirmActionButton) return;

    confirmActionButton.addEventListener("click", async () => {
        const action = pendingConfirmAction;
        pendingConfirmAction = null;

        closeModalById("confirm-modal");
        if (typeof action === "function") {
            await action();
        }
    });
}

function setupWelcomeModal() {
    if (welcomeContinueBtn) {
        welcomeContinueBtn.addEventListener("click", () => {
            closeModalById("welcome-modal");
        });
    }

    window.showWelcomeModal = (displayName, onContinue) => {
        if (!welcomeModal || !welcomeUserName) {
            alert(`Welcome, ${displayName || "Learner"}`);
            if (typeof onContinue === "function") onContinue();
            return;
        }

        welcomeUserName.textContent = displayName || "Learner";
        pendingWelcomeContinue = typeof onContinue === "function" ? onContinue : null;
        openModal(welcomeModal);
    };

    if (window.pendingWelcomeUserName) {
        window.showWelcomeModal(window.pendingWelcomeUserName);
        window.pendingWelcomeUserName = null;
    }
}

function setupNoticeModal() {
    if (noticeOkBtn) {
        noticeOkBtn.addEventListener("click", () => {
            closeModalById("notice-modal");
        });
    }
}

function showNoticeModal(title, message) {
    if (!noticeModal || !noticeTitle || !noticeMessage) {
        alert(message || title || "Notice");
        return;
    }
    noticeTitle.textContent = title || "Notice";
    noticeMessage.textContent = message || "";
    openModal(noticeModal);
}

async function fetchCollections() {
    if (!hasValidToken()) {
        collections = [];
        activeCollection = "all";
        renderCollectionOptions();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/collections`, {
            method: "GET",
            headers: getHeaders()
        });

        if (response.status === 401) {
            collections = [];
            activeCollection = "all";
            renderCollectionOptions();
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const payload = await response.json();
        collections = Array.isArray(payload) ? payload.map(normalizeCollectionPayload) : [];

        if (
            activeCollection !== "all" &&
            !collections.some((collection) => String(collection.id) === String(activeCollection))
        ) {
            activeCollection = "all";
        }

        renderCollectionOptions();
    } catch (error) {
        console.error("Failed to load collections:", error);
        collections = [];
        activeCollection = "all";
        renderCollectionOptions();
    }
}

function createCollection() {
    openCollectionModal();
}

function openCollectionModal() {
    if (!collectionModal || !collectionNameInput || !collectionClassInput || !collectionColorInput) return;
    if (!hasValidToken()) {
        showNoticeModal("Sign In Required", "You must be logged in to add a collection.");
        return;
    }

    collectionNameInput.value = "";
    collectionClassInput.value = "";
    collectionColorInput.value = DEFAULT_COLLECTION_COLOR.toLowerCase();
    if (collectionColorValue) {
        collectionColorValue.textContent = DEFAULT_COLLECTION_COLOR;
    }
    setModalError(collectionError);
    openModal(collectionModal);
    collectionNameInput.focus();
}

async function handleCollectionFormSubmit(event) {
    event.preventDefault();
    if (!collectionNameInput || !collectionClassInput || !collectionColorInput) return;

    const name = collectionNameInput.value.trim();
    const className = collectionClassInput.value.trim();
    const color = sanitizeCollectionColor(collectionColorInput.value);

    if (!name) {
        setModalError(collectionError, "Collection name cannot be empty.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/collections`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                name: name,
                class_name: className || null,
                color: color
            })
        });

        const payload = await response.json().catch(() => ({}));

        if (response.status === 401) {
            setModalError(collectionError, "Session expired. Please login again.");
            return;
        }

        if (response.status === 409) {
            setModalError(collectionError, payload.detail || "That collection already exists.");
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        activeCollection = String(payload.id);
        closeModalById("collection-modal");
        await fetchCollections();
        await fetchFlashcards();
    } catch (error) {
        console.error("Failed to create collection:", error);
        setModalError(collectionError, "Could not create collection right now.");
    }
}

function onCollectionChange() {
    if (!collectionSelect) return;
    activeCollection = collectionSelect.value || "all";
    updateActiveCollectionLabel();
    fetchFlashcards();
}

function buildCardsUrl() {
    const collectionId = getSelectedCollectionId();
    if (collectionId === null) {
        return `${API_URL}/cards`;
    }

    const params = new URLSearchParams({ collection_id: String(collectionId) });
    return `${API_URL}/cards?${params.toString()}`;
}

async function fetchFlashcards() {
    if (!hasValidToken()) {
        cardQuestion.textContent = "Please Login to see your cards.";
        cardAnswer.textContent = "Click the Login button above.";
        flashcards = [];
        currentIndex = 0;
        updateCardDisplay();
        return;
    }

    try {
        const response = await fetch(buildCardsUrl(), {
            method: "GET",
            headers: getHeaders()
        });

        if (response.status === 401) {
            cardQuestion.textContent = "Session expired.";
            cardAnswer.textContent = "Please logout and login again.";
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        flashcards = await response.json();
        currentIndex = 0;
        updateCardDisplay();
    } catch (error) {
        console.error("Fetch error:", error);
        cardQuestion.textContent = "Error loading cards.";
        cardAnswer.textContent = "Check console for details.";
    }
}

function openAddCardModal() {
    if (!addCardModal || !addCardQuestionInput || !addCardAnswerInput) return;

    if (!hasValidToken()) {
        showNoticeModal("Sign In Required", "You must be logged in to add a card.");
        return;
    }

    const selectedCollection = collections.find(
        (collection) => String(collection.id) === String(activeCollection)
    );
    if (addCardCollectionName) {
        addCardCollectionName.textContent = getCollectionDisplayName(selectedCollection);
    }

    addCardQuestionInput.value = "";
    addCardAnswerInput.value = "";
    setModalError(addCardError);
    openModal(addCardModal);
    addCardQuestionInput.focus();
}

function closeAddCardModal() {
    closeModalById("add-card-modal");
}

async function handleAddCardFormSubmit(event) {
    event.preventDefault();
    if (!addCardQuestionInput || !addCardAnswerInput) return;

    const question = addCardQuestionInput.value.trim();
    const answer = addCardAnswerInput.value.trim();

    if (!question || !answer) {
        setModalError(addCardError, "Please fill in both the Question and the Answer fields.");
        return;
    }

    const saved = await saveFlashcard(question, answer, addCardError);
    if (saved) {
        closeModalById("add-card-modal");
    }
}

async function saveFlashcard(question, answer, errorElement = null) {
    if (!hasValidToken()) {
        if (errorElement) {
            setModalError(errorElement, "You must be logged in to add a card.");
        } else {
            showNoticeModal("Sign In Required", "You must be logged in to add a card.");
        }
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/cards`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                question: question,
                answer: answer,
                collection_id: getSelectedCollectionId()
            })
        });

        if (response.status === 401) {
            setModalError(errorElement, "Session expired. Please login again.");
            return false;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        await fetchFlashcards();
        setTimeout(() => {
            currentIndex = flashcards.length - 1;
            updateCardDisplay();
            playCardAnimation("pop");
        }, 100);
        return true;
    } catch (error) {
        console.error("Error adding card:", error);
        if (errorElement) {
            setModalError(errorElement, "Failed to save card. Please try again.");
        } else {
            alert("Failed to save card. Check console for details.");
        }
        return false;
    }
}

function addFlashcard() {
    openAddCardModal();
}

function showConfirmModal({ title, message, confirmText, danger, onConfirm }) {
    if (!confirmModal || !confirmTitle || !confirmMessage || !confirmActionButton) {
        if (confirm(message || "Are you sure?") && typeof onConfirm === "function") {
            onConfirm();
        }
        return;
    }

    confirmTitle.textContent = title || "Please Confirm";
    confirmMessage.textContent = message || "Are you sure you want to continue?";
    confirmActionButton.textContent = confirmText || "Confirm";
    confirmActionButton.classList.toggle("modal-danger-btn", Boolean(danger));
    confirmActionButton.disabled = false;
    pendingConfirmAction = onConfirm;
    openModal(confirmModal);
}

async function deleteFlashcard() {
    if (flashcards.length === 0) return;
    if (!hasValidToken()) {
        alert("You must be logged in to delete cards.");
        return;
    }

    const currentCard = flashcards[currentIndex];
    showConfirmModal({
        title: "Delete this flashcard?",
        message: "This action will permanently remove the current card.",
        confirmText: "Delete Card",
        danger: true,
        onConfirm: async () => {
            try {
                const response = await fetch(`${API_URL}/cards/${currentCard.id}`, {
                    method: "DELETE",
                    headers: getHeaders()
                });

                if (response.status === 401) {
                    alert("Session expired. Please login again.");
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }

                playCardAnimation("pop-out");
                await wait(350);
                await fetchFlashcards();

                if (currentIndex >= flashcards.length) {
                    currentIndex = Math.max(0, flashcards.length - 1);
                }
                updateCardDisplay();
            } catch (error) {
                console.error("Delete failed:", error);
                alert("Failed to delete card.");
            }
        }
    });
}

function editFlashcard() {
    if (flashcards.length === 0) return;
    if (!hasValidToken()) {
        alert("You must be logged in to edit cards.");
        return;
    }

    const card = flashcards[currentIndex];
    if (!editCardModal || !editQuestionInput || !editAnswerInput) return;

    editingCardId = card.id;
    editQuestionInput.value = card.question || "";
    editAnswerInput.value = card.answer || "";
    setModalError(editCardError);
    openModal(editCardModal);
    editQuestionInput.focus();
}

async function handleEditCardFormSubmit(event) {
    event.preventDefault();
    if (!editQuestionInput || !editAnswerInput || editingCardId === null) return;

    const question = editQuestionInput.value.trim();
    const answer = editAnswerInput.value.trim();

    if (!question || !answer) {
        setModalError(editCardError, "Please fill in both fields.");
        return;
    }

    const targetCard = flashcards.find((card) => card.id === editingCardId);
    const collectionId = targetCard ? (targetCard.collection_id ?? null) : null;

    try {
        const response = await fetch(`${API_URL}/cards/${editingCardId}`, {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify({
                question: question,
                answer: answer,
                collection_id: collectionId
            })
        });

        if (response.status === 401) {
            setModalError(editCardError, "Session expired. Please login again.");
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        closeModalById("edit-card-modal");
        await fetchFlashcards();
    } catch (error) {
        console.error("Edit failed:", error);
        setModalError(editCardError, "Failed to update card. Please try again.");
    }
}

function playCardAnimation(animationClass) {
    if (!flashcardElement) return;
    flashcardElement.classList.remove("slide-left", "slide-right", "pop", "pop-out");
    void flashcardElement.offsetWidth;
    flashcardElement.classList.add(animationClass);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

flashcardElement?.addEventListener("animationend", () => {
    flashcardElement.classList.remove("slide-left", "slide-right", "pop", "pop-out");
});

function updateCardDisplay() {
    if (flashcards.length === 0) {
        cardQuestion.textContent = activeCollection === "all" ? "No cards yet." : "No cards in this collection yet.";
        cardAnswer.textContent = "...";
        cardIndexDisplay.textContent = "0 / 0";
        return;
    }

    cardInner.classList.remove("flipped");
    cardQuestion.textContent = flashcards[currentIndex].question;
    cardAnswer.textContent = flashcards[currentIndex].answer;
    cardIndexDisplay.textContent = `${currentIndex + 1} / ${flashcards.length}`;
}

function flipCard() {
    cardInner.classList.toggle("flipped");
}

function nextCard() {
    if (flashcards.length) {
        currentIndex = (currentIndex + 1) % flashcards.length;
        updateCardDisplay();
        playCardAnimation("slide-left");
    }
}

function prevCard() {
    if (flashcards.length) {
        currentIndex = (currentIndex - 1 + flashcards.length) % flashcards.length;
        updateCardDisplay();
        playCardAnimation("slide-right");
    }
}
