// script.js
// PASTE YOUR CODESPACE URL HERE (No trailing slash)
const API_URL = "https://flashcardapp-pwic.onrender.com";

let flashcards = [];
let collections = [];
let currentIndex = 0;
let activeCollection = "all";

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

document.addEventListener("DOMContentLoaded", initializeApp);

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

function updateActiveCollectionLabel() {
    if (!activeCollectionText) return;
    if (activeCollection === "all") {
        activeCollectionText.textContent = "Showing: All Collections";
        return;
    }

    const selected = collections.find((collection) => String(collection.id) === String(activeCollection));
    activeCollectionText.textContent = `Showing: ${getCollectionDisplayName(selected)}`;
}

function renderCollectionOptions() {
    if (!collectionSelect) return;

    const options = ['<option value="all">All Collections</option>'];
    for (const collection of collections) {
        options.push(
            `<option value="${collection.id}">${getCollectionDisplayName(collection)}</option>`
        );
    }
    collectionSelect.innerHTML = options.join("");
    collectionSelect.value = activeCollection;
    updateActiveCollectionLabel();
}

async function initializeApp() {
    setupAddCardModal();
    renderCollectionOptions();
    await fetchCollections();
    await fetchFlashcards();
}

function setupAddCardModal() {
    if (!addCardModal || !addCardForm) return;

    addCardForm.addEventListener("submit", handleAddCardFormSubmit);

    addCardModal.addEventListener("click", (event) => {
        if (event.target === addCardModal) {
            closeAddCardModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && addCardModal.classList.contains("is-open")) {
            closeAddCardModal();
        }
    });
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

        collections = await response.json();

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

async function createCollection() {
    if (!hasValidToken()) {
        alert("You must be logged in to create a collection.");
        return;
    }

    const nameInput = prompt("Collection name (example: Chapter 1):");
    if (nameInput === null) return;
    const classInput = prompt("Class name (optional, example: Biology 101):");

    const name = nameInput.trim();
    const className = classInput ? classInput.trim() : "";

    if (!name) {
        alert("Collection name cannot be empty.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/collections`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                name: name,
                class_name: className || null
            })
        });

        const payload = await response.json().catch(() => ({}));

        if (response.status === 401) {
            alert("Session expired. Please login again.");
            return false;
        }

        if (response.status === 409) {
            alert(payload.detail || "That collection already exists.");
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        activeCollection = String(payload.id);
        await fetchCollections();
        await fetchFlashcards();
    } catch (error) {
        console.error("Failed to create collection:", error);
        alert("Could not create collection.");
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
        alert("You must be logged in to add a card.");
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
    addCardModal.classList.add("is-open");
    addCardModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    addCardQuestionInput.focus();
}

function closeAddCardModal() {
    if (!addCardModal) return;
    addCardModal.classList.remove("is-open");
    addCardModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
}

async function handleAddCardFormSubmit(event) {
    event.preventDefault();
    if (!addCardQuestionInput || !addCardAnswerInput) return;

    const trimmedQuestion = addCardQuestionInput.value.trim();
    const trimmedAnswer = addCardAnswerInput.value.trim();

    if (!trimmedQuestion || !trimmedAnswer) {
        alert("Please fill in both the Question and the Answer fields.");
        return;
    }

    const saved = await saveFlashcard(trimmedQuestion, trimmedAnswer);
    if (saved) {
        closeAddCardModal();
    }
}

async function saveFlashcard(question, answer) {
    if (!hasValidToken()) {
        alert("You must be logged in to add a card.");
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
            alert("Session expired. Please login again.");
            return;
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
        alert("Failed to save card. Check console for details.");
        return false;
    }
}

function addFlashcard() {
    openAddCardModal();
}

async function deleteFlashcard() {
    if (flashcards.length === 0) return;
    const id = flashcards[currentIndex].id;

    if (!hasValidToken()) {
        alert("You must be logged in to delete cards.");
        return;
    }

    if (!confirm("Are you sure you want to delete this card?")) return;

    try {
        const response = await fetch(`${API_URL}/cards/${id}`, {
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

async function editFlashcard() {
    if (flashcards.length === 0) return;

    if (!hasValidToken()) {
        alert("You must be logged in to edit cards.");
        return;
    }

    const card = flashcards[currentIndex];
    const newQ = prompt("New Question:", card.question);
    const newA = prompt("New Answer:", card.answer);

    if (newQ && newA) {
        try {
            const response = await fetch(`${API_URL}/cards/${card.id}`, {
                method: "PUT",
                headers: getHeaders(),
                body: JSON.stringify({
                    question: newQ.trim(),
                    answer: newA.trim(),
                    collection_id: card.collection_id ?? null
                })
            });

            if (response.status === 401) {
                alert("Session expired. Please login again.");
                return;
            }

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            await fetchFlashcards();
        } catch (error) {
            console.error("Edit failed:", error);
            alert("Failed to update card.");
        }
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
