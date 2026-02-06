// script.js
// PASTE YOUR CODESPACE URL HERE (No trailing slash)
const API_URL = "https://flashcardapp-pwic.onrender.com"; 

let flashcards = [];
let currentIndex = 0;

const cardQuestion = document.getElementById('card-question');
const cardAnswer = document.getElementById('card-answer');
const cardInner = document.getElementById('card-inner');
const cardIndexDisplay = document.getElementById('card-index');
const flashcardElement = document.getElementById('flashcard');

// Load cards on startup
document.addEventListener('DOMContentLoaded', fetchFlashcards);

// Add this helper function at the top
function getHeaders() {
    const token = localStorage.getItem("userToken");
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` // Send the token to Python
    };
}

// --- The Main Function ---
async function fetchFlashcards() {
    // 1. Check if we even have a token locally
    const headers = getHeaders();
    if (!headers.Authorization.includes("ey")) { 
        // "ey" is the starting characters of all Firebase tokens. 
        // If it's missing, the user definitely isn't logged in.
        cardQuestion.textContent = "Please Login to see your cards.";
        cardAnswer.textContent = "Click the Login button above.";
        flashcards = []; // Clear any old data
        updateCardDisplay();
        return; // Stop here, don't bother the server
    }

    try {
        // 2. Make the Request to Python
        const response = await fetch(`${API_URL}/cards`, { 
            method: "GET",
            headers: headers // We pass the security token here
        });

        // 3. Handle "Unauthorized" (Token expired or invalid)
        if (response.status === 401) {
            cardQuestion.textContent = "Session expired.";
            cardAnswer.textContent = "Please logout and login again.";
            return;
        }

        // 4. Handle other server errors (500, 404, etc.)
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        // 5. Success! Parse the data
        flashcards = await response.json();
        
        // 6. Reset the view to the first card
        currentIndex = 0;
        updateCardDisplay();

    } catch (error) {
        // 7. Handle Network Errors (Server down, internet off)
        console.error("Fetch error:", error);
        cardQuestion.textContent = "Error loading cards.";
        cardAnswer.textContent = "Check console for details.";
    }
}

async function addFlashcard() {
    // 1. Ask the user for the card details
    const question = prompt("Enter the question:");
    if (question === null) return;
    const answer = prompt("Enter the answer:");
    if (answer === null) return;

    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();

    // 2. Validate: Don't let them send empty cards
    if (!trimmedQuestion || !trimmedAnswer) {
        alert("Please fill in both the Question and the Answer fields.");
        return;
    }

    // 3. Security Check: Are they logged in?
    const headers = getHeaders();
    if (!headers.Authorization.includes("ey")) {
        alert("You must be logged in to add a card.");
        return;
    }

    try {
        // 4. Send the data to Python
        const response = await fetch(`${API_URL}/cards`, {
            method: "POST",
            headers: headers, // Pass the token here!
            body: JSON.stringify({ 
                question: trimmedQuestion, 
                answer: trimmedAnswer 
            })
        });

        // 5. Handle Errors
        if (response.status === 401) {
            alert("Session expired. Please login again.");
            return;
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        // 7. Refresh the list so the new card appears immediately
        await fetchFlashcards();
        
        // Optional: Jump to the new card (usually the last one)
        // We wait a tiny bit to ensure the list updated
        setTimeout(() => {
            currentIndex = flashcards.length - 1;
            updateCardDisplay();
            playCardAnimation('pop');
        }, 100);

    } catch (error) {
        console.error("Error adding card:", error);
        alert("Failed to save card. Check console for details.");
    }
}

async function deleteFlashcard() {
    // 1. Safety check: Are there even cards to delete?
    if (flashcards.length === 0) return;

    // 2. Get the ID of the specific card you are looking at
    const id = flashcards[currentIndex].id;

    // 3. Security Check: Get the token
    const headers = getHeaders();
    if (!headers.Authorization.includes("ey")) {
        alert("You must be logged in to delete cards.");
        return;
    }

    if (!confirm("Are you sure you want to delete this card?")) return;

    try {
        // 4. Send the DELETE request WITH the header
        const response = await fetch(`${API_URL}/cards/${id}`, { 
            method: "DELETE",
            headers: headers // <--- THIS WAS MISSING
        });

        // 5. Handle potential errors
        if (response.status === 401) {
            alert("Session expired. Please login again.");
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        // 6. Success! Pop the current card out before refreshing the list
        playCardAnimation('pop-out');
        await wait(350);
        await fetchFlashcards();
        
        // Adjust the view so it doesn't show a blank space
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
    // 1. Safety Check: Are there cards to edit?
    if (flashcards.length === 0) return;

    // 2. Security Check: Get the token
    const headers = getHeaders();
    if (!headers.Authorization.includes("ey")) {
        alert("You must be logged in to edit cards.");
        return;
    }

    const card = flashcards[currentIndex];

    // 3. Ask the user for new text
    const newQ = prompt("New Question:", card.question);
    const newA = prompt("New Answer:", card.answer);
    
    // Only proceed if they actually typed something (and didn't click Cancel)
    if (newQ && newA) {
        try {
            // 4. Send the PUT request WITH the header
            const response = await fetch(`${API_URL}/cards/${card.id}`, {
                method: "PUT",
                headers: headers, // <--- THIS WAS MISSING
                body: JSON.stringify({ 
                    question: newQ, 
                    answer: newA 
                })
            });

            // 5. Handle Errors
            if (response.status === 401) {
                alert("Session expired. Please login again.");
                return;
            }

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            // 6. Success! Refresh the list
            await fetchFlashcards();

        } catch (error) {
            console.error("Edit failed:", error);
            alert("Failed to update card.");
        }
    }
}

function playCardAnimation(animationClass) {
    if (!flashcardElement) return;
    flashcardElement.classList.remove('slide-left', 'slide-right', 'pop', 'pop-out');
    void flashcardElement.offsetWidth;
    flashcardElement.classList.add(animationClass);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

flashcardElement?.addEventListener('animationend', () => {
    flashcardElement.classList.remove('slide-left', 'slide-right', 'pop', 'pop-out');
});


// UI Logic
function updateCardDisplay() {
    if (flashcards.length === 0) {
        cardQuestion.textContent = "No cards yet.";
        cardAnswer.textContent = "...";
        cardIndexDisplay.textContent = "0 / 0";
        return;
    }
    cardInner.classList.remove('flipped');
    cardQuestion.textContent = flashcards[currentIndex].question;
    cardAnswer.textContent = flashcards[currentIndex].answer;
    cardIndexDisplay.textContent = `${currentIndex + 1} / ${flashcards.length}`;
}

function flipCard() { cardInner.classList.toggle('flipped'); }
function nextCard() { 
    if(flashcards.length) {
        currentIndex = (currentIndex + 1) % flashcards.length; 
        updateCardDisplay(); 
        playCardAnimation('slide-left');
    }
}
function prevCard() { 
    if(flashcards.length) {
        currentIndex = (currentIndex - 1 + flashcards.length) % flashcards.length; 
        updateCardDisplay(); 
        playCardAnimation('slide-right');
    }
}
