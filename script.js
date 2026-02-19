// script.js
// PASTE YOUR CODESPACE URL HERE (No trailing slash)
const API_URL = "https://flashcardapp-pwic.onrender.com";
const DEFAULT_COLLECTION_COLOR = "#0F4C5C";

let flashcards = [];
let allFlashcards = [];
let collections = [];
let currentIndex = 0;
let activeCollection = "all";
let editingCardId = null;
let editingCollectionId = null;
let pendingConfirmAction = null;
let pendingWelcomeContinue = null;

const cardQuestion = document.getElementById("card-question");
const cardAnswer = document.getElementById("card-answer");
const cardInner = document.getElementById("card-inner");
const cardIndexDisplay = document.getElementById("card-index");
const flashcardElement = document.getElementById("flashcard");
const collectionSelect = document.getElementById("collection-select");
const collectionTree = document.getElementById("collection-tree");
const activeCollectionText = document.getElementById("active-collection");
const collectionColorSwatch = document.getElementById("collection-color-swatch");
const editCollectionButton = document.getElementById("edit-collection-btn");
const deleteCollectionButton = document.getElementById("delete-collection-btn");

const addCardModal = document.getElementById("add-card-modal");
const addCardForm = document.getElementById("add-card-form");
const addCardQuestionInput = document.getElementById("modal-question");
const addCardAnswerInput = document.getElementById("modal-answer");
const addCardCollectionName = document.getElementById("add-card-collection-name");
const addCardError = document.getElementById("add-card-error");

const collectionModal = document.getElementById("collection-modal");
const collectionModalTitle = document.getElementById("collection-modal-title");
const collectionModalSubtitle = document.getElementById("collection-modal-subtitle");
const collectionSubmitButton = document.getElementById("collection-submit-btn");
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

function getActiveCollection() {
    if (activeCollection === "all") return null;
    return collections.find((collection) => String(collection.id) === String(activeCollection)) || null;
}

function getFilteredCards() {
    if (activeCollection === "all") {
        return [...allFlashcards];
    }
    return allFlashcards.filter((card) => String(card.collection_id) === String(activeCollection));
}

function truncateCardQuestion(question) {
    const normalized = String(question || "Untitled card").replace(/\s+/g, " ").trim();
    if (normalized.length <= 50) return normalized;
    return `${normalized.slice(0, 47)}...`;
}

function applyActiveCollectionFilter({ preferredCardId = null, resetIndex = false } = {}) {
    flashcards = getFilteredCards();

    if (resetIndex) {
        currentIndex = 0;
    }

    if (preferredCardId !== null) {
        const preferredIndex = flashcards.findIndex((card) => String(card.id) === String(preferredCardId));
        currentIndex = preferredIndex >= 0 ? preferredIndex : 0;
    }

    if (currentIndex >= flashcards.length) {
        currentIndex = Math.max(0, flashcards.length - 1);
    }
    if (currentIndex < 0 || !Number.isInteger(currentIndex)) {
        currentIndex = 0;
    }

    updateActiveCollectionLabel();
    updateCardDisplay();
}

function setActiveCollection(nextCollection, options = {}) {
    activeCollection = String(nextCollection || "all");
    if (collectionSelect) {
        collectionSelect.value = activeCollection;
    }
    applyActiveCollectionFilter(options);
}

function renderCollectionTree() {
    if (!collectionTree) return;

    const activeCardId = flashcards[currentIndex]?.id ?? null;
    collectionTree.innerHTML = "";

    const allFolderItem = document.createElement("li");
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = `collection-folder-btn ${activeCollection === "all" ? "is-active" : ""}`;
    allButton.addEventListener("click", () => {
        setActiveCollection("all", { resetIndex: true });
    });

    const allDot = document.createElement("span");
    allDot.className = "folder-dot";
    allDot.style.background = DEFAULT_COLLECTION_COLOR;

    const allName = document.createElement("span");
    allName.className = "folder-name";
    allName.textContent = "All Collections";

    const allCount = document.createElement("span");
    allCount.className = "folder-count";
    allCount.textContent = String(allFlashcards.length);

    allButton.appendChild(allDot);
    allButton.appendChild(allName);
    allButton.appendChild(allCount);
    allFolderItem.appendChild(allButton);
    collectionTree.appendChild(allFolderItem);

    if (!collections.length) {
        const empty = document.createElement("li");
        empty.className = "collection-tree-empty";
        empty.textContent = hasValidToken()
            ? "No folders yet. Create your first collection."
            : "Login to load your collections.";
        collectionTree.appendChild(empty);
        return;
    }

    for (const collection of collections) {
        const folderCards = allFlashcards.filter((card) => String(card.collection_id) === String(collection.id));
        const isActiveFolder = String(collection.id) === String(activeCollection);
        const isOpen = activeCollection === "all" || isActiveFolder;

        const folderItem = document.createElement("li");

        const folderButton = document.createElement("button");
        folderButton.type = "button";
        folderButton.className = `collection-folder-btn ${isActiveFolder ? "is-active" : ""}`;
        folderButton.addEventListener("click", () => {
            setActiveCollection(String(collection.id), { resetIndex: true });
        });

        const folderDot = document.createElement("span");
        folderDot.className = "folder-dot";
        folderDot.style.background = sanitizeCollectionColor(collection.color);

        const folderName = document.createElement("span");
        folderName.className = "folder-name";
        folderName.textContent = getCollectionDisplayName(collection);

        const folderCount = document.createElement("span");
        folderCount.className = "folder-count";
        folderCount.textContent = String(folderCards.length);

        folderButton.appendChild(folderDot);
        folderButton.appendChild(folderName);
        folderButton.appendChild(folderCount);
        folderItem.appendChild(folderButton);

        const cardList = document.createElement("ul");
        cardList.className = `collection-card-list ${isOpen ? "is-open" : ""}`;

        if (!folderCards.length) {
            const emptyCardRow = document.createElement("li");
            emptyCardRow.className = "collection-card-empty";
            emptyCardRow.textContent = "No cards in this folder.";
            cardList.appendChild(emptyCardRow);
        } else {
            for (const card of folderCards) {
                const cardItem = document.createElement("li");
                const cardButton = document.createElement("button");
                cardButton.type = "button";
                cardButton.className = `collection-card-btn ${isActiveFolder && String(card.id) === String(activeCardId) ? "is-active" : ""}`;
                cardButton.textContent = truncateCardQuestion(card.question);
                cardButton.title = card.question || "Untitled card";
                cardButton.addEventListener("click", () => {
                    setActiveCollection(String(collection.id), {
                        preferredCardId: card.id,
                        resetIndex: false
                    });
                });

                cardItem.appendChild(cardButton);
                cardList.appendChild(cardItem);
            }
        }

        folderItem.appendChild(cardList);
        collectionTree.appendChild(folderItem);
    }
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
        editingCollectionId = null;
        setModalError(collectionError);
        if (collectionModalTitle) {
            collectionModalTitle.textContent = "Create Collection";
        }
        if (collectionModalSubtitle) {
            collectionModalSubtitle.textContent = "Group cards by class, chapter, or exam topic.";
        }
        if (collectionSubmitButton) {
            collectionSubmitButton.textContent = "Create Collection";
        }
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
        if (collectionSelect) {
            collectionSelect.style.color = shiftHexColor(DEFAULT_COLLECTION_COLOR, -0.35);
            collectionSelect.style.background = `linear-gradient(145deg, ${toRgba(DEFAULT_COLLECTION_COLOR, 0.14)}, rgba(255, 255, 255, 0.95))`;
        }
        if (collectionColorSwatch) {
            collectionColorSwatch.style.background = DEFAULT_COLLECTION_COLOR;
            collectionColorSwatch.title = `All Collections color preview (${DEFAULT_COLLECTION_COLOR})`;
        }
        updateCollectionActionButtons(null);
        return;
    }

    const selected = getActiveCollection();
    activeCollectionText.textContent = `Showing: ${getCollectionDisplayName(selected)}`;
    const previewColor = selected?.color || DEFAULT_COLLECTION_COLOR;
    applyCollectionTheme(previewColor);
    if (collectionSelect) {
        collectionSelect.style.color = shiftHexColor(previewColor, -0.35);
        collectionSelect.style.background = `linear-gradient(145deg, ${toRgba(previewColor, 0.2)}, rgba(255, 255, 255, 0.95))`;
    }
    if (collectionColorSwatch) {
        collectionColorSwatch.style.background = previewColor;
        collectionColorSwatch.title = `Selected collection color (${previewColor})`;
    }
    updateCollectionActionButtons(selected);
}

function updateCollectionActionButtons(selectedCollection) {
    const disabled = !hasValidToken() || !selectedCollection;
    if (editCollectionButton) editCollectionButton.disabled = disabled;
    if (deleteCollectionButton) deleteCollectionButton.disabled = disabled;
}

function renderCollectionOptions() {
    if (collectionSelect) {
        collectionSelect.innerHTML = "";

        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "All Collections";
        collectionSelect.appendChild(allOption);

        for (const collection of collections) {
            const option = document.createElement("option");
            option.value = String(collection.id);
            option.textContent = getCollectionDisplayName(collection);
            collectionSelect.appendChild(option);
        }

        const optionExists = Array.from(collectionSelect.options).some((option) => option.value === String(activeCollection));
        if (!optionExists) {
            activeCollection = "all";
        }

        collectionSelect.value = activeCollection;
    }

    updateActiveCollectionLabel();
    renderCollectionTree();
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
    openCollectionModal("create");
}

function openEditCollectionModal() {
    const selectedCollection = getActiveCollection();
    if (!selectedCollection) {
        showNoticeModal("Select a Collection", "Please select a collection to edit.");
        return;
    }
    openCollectionModal("edit", selectedCollection);
}

function openCollectionModal(mode = "create", selectedCollection = null) {
    if (!collectionModal || !collectionNameInput || !collectionClassInput || !collectionColorInput) return;
    if (!hasValidToken()) {
        showNoticeModal("Sign In Required", "You must be logged in to add a collection.");
        return;
    }

    const isEditMode = mode === "edit" && selectedCollection;
    editingCollectionId = isEditMode ? selectedCollection.id : null;

    collectionNameInput.value = isEditMode ? (selectedCollection.name || "") : "";
    collectionClassInput.value = isEditMode ? (selectedCollection.class_name || "") : "";
    collectionColorInput.value = sanitizeCollectionColor(
        isEditMode ? selectedCollection.color : DEFAULT_COLLECTION_COLOR
    ).toLowerCase();
    if (collectionColorValue) {
        collectionColorValue.textContent = sanitizeCollectionColor(collectionColorInput.value);
    }
    if (collectionModalTitle) {
        collectionModalTitle.textContent = isEditMode ? "Edit Collection" : "Create Collection";
    }
    if (collectionModalSubtitle) {
        collectionModalSubtitle.textContent = isEditMode
            ? "Rename or recolor this collection."
            : "Group cards by class, chapter, or exam topic.";
    }
    if (collectionSubmitButton) {
        collectionSubmitButton.textContent = isEditMode ? "Save Collection" : "Create Collection";
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
        const isEditMode = editingCollectionId !== null;
        const endpoint = isEditMode
            ? `${API_URL}/collections/${editingCollectionId}`
            : `${API_URL}/collections`;
        const response = await fetch(endpoint, {
            method: isEditMode ? "PUT" : "POST",
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

        activeCollection = String(payload.id || editingCollectionId);
        closeModalById("collection-modal");
        await fetchCollections();
        await fetchFlashcards();
    } catch (error) {
        console.error("Failed to create collection:", error);
        setModalError(collectionError, "Could not create collection right now.");
    }
}

async function deleteCollection() {
    const selectedCollection = getActiveCollection();
    if (!selectedCollection) {
        showNoticeModal("Select a Collection", "Please select a collection to delete.");
        return;
    }

    if (!hasValidToken()) {
        showNoticeModal("Sign In Required", "You must be logged in to delete a collection.");
        return;
    }

    showConfirmModal({
        title: "Delete this collection?",
        message: `Cards will remain but become uncategorized. Collection: ${getCollectionDisplayName(selectedCollection)}.`,
        confirmText: "Delete Collection",
        danger: true,
        onConfirm: async () => {
            try {
                const response = await fetch(`${API_URL}/collections/${selectedCollection.id}`, {
                    method: "DELETE",
                    headers: getHeaders()
                });

                if (response.status === 401) {
                    showNoticeModal("Session Expired", "Please login again.");
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }

                activeCollection = "all";
                await fetchCollections();
                await fetchFlashcards();
            } catch (error) {
                console.error("Delete collection failed:", error);
                showNoticeModal("Delete Failed", "Could not delete this collection right now.");
            }
        }
    });
}

function onCollectionChange() {
    setActiveCollection(collectionSelect?.value || "all", { resetIndex: true });
}

async function fetchFlashcards() {
    if (!hasValidToken()) {
        cardQuestion.textContent = "Please Login to see your cards.";
        cardAnswer.textContent = "Click the Login button above.";
        allFlashcards = [];
        flashcards = [];
        currentIndex = 0;
        updateActiveCollectionLabel();
        updateCardDisplay();
        return;
    }

    try {
        const previousCardId = flashcards[currentIndex]?.id ?? null;
        const response = await fetch(`${API_URL}/cards`, {
            method: "GET",
            headers: getHeaders()
        });

        if (response.status === 401) {
            cardQuestion.textContent = "Session expired.";
            cardAnswer.textContent = "Please logout and login again.";
            allFlashcards = [];
            flashcards = [];
            currentIndex = 0;
            cardIndexDisplay.textContent = "0 / 0";
            updateActiveCollectionLabel();
            renderCollectionTree();
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const payload = await response.json();
        allFlashcards = Array.isArray(payload) ? payload : [];
        applyActiveCollectionFilter({ preferredCardId: previousCardId, resetIndex: false });
    } catch (error) {
        console.error("Fetch error:", error);
        allFlashcards = [];
        flashcards = [];
        currentIndex = 0;
        cardQuestion.textContent = "Error loading cards.";
        cardAnswer.textContent = "Check console for details.";
        cardIndexDisplay.textContent = "0 / 0";
        updateActiveCollectionLabel();
        renderCollectionTree();
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

        const createdCard = await response.json().catch(() => ({}));
        await fetchFlashcards();
        setTimeout(() => {
            const createdIndex = flashcards.findIndex((card) => String(card.id) === String(createdCard.id));
            currentIndex = createdIndex >= 0 ? createdIndex : Math.max(0, flashcards.length - 1);
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
    if (!hasValidToken()) {
        cardQuestion.textContent = "Please Login to see your cards.";
        cardAnswer.textContent = "Click the Login button above.";
        cardIndexDisplay.textContent = "0 / 0";
        renderCollectionTree();
        return;
    }

    if (flashcards.length === 0) {
        cardQuestion.textContent = activeCollection === "all" ? "No cards yet." : "No cards in this collection yet.";
        cardAnswer.textContent = "...";
        cardIndexDisplay.textContent = "0 / 0";
        renderCollectionTree();
        return;
    }

    cardInner.classList.remove("flipped");
    cardQuestion.textContent = flashcards[currentIndex].question;
    cardAnswer.textContent = flashcards[currentIndex].answer;
    cardIndexDisplay.textContent = `${currentIndex + 1} / ${flashcards.length}`;
    renderCollectionTree();
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
