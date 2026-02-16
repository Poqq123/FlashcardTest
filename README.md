
* **Website: [FlashLearn](https://poqq123.github.io/FlashLearn/)**

## New Collections Feature

You can now:
- Create named collections (optionally tagged with a class name)
- Assign cards to a collection when creating cards
- Filter the flashcard view by selected collection
- Fetch cards by collection through dedicated API endpoints

## Backend Overview

Main backend file: `/Users/GeneralUse/LinuxHome/FlashcardTest/main.py`

### Data model
- `flashcards`
  - `id`
  - `user_id`
  - `question`
  - `answer`
  - `collection_id` (nullable)
- `collections`
  - `id`
  - `user_id`
  - `name`
  - `class_name` (nullable)

### Startup schema guard

`main.py` includes `ensure_schema()` which:
- keeps existing DBs working
- adds missing `flashcards.user_id` and `flashcards.collection_id` columns when needed
- creates indexes if missing

This avoids dropping tables for existing deployments.

## API Documentation

All endpoints below require a Supabase bearer token in `Authorization` header.

### Health
- `GET /`
  - Returns service status text.

### Collections
- `GET /collections`
  - Lists current user collections.

- `POST /collections`
  - Body:
    ```json
    {
      "name": "Chapter 3",
      "class_name": "Biology 101"
    }
    ```
  - Creates a collection for the authenticated user.

- `DELETE /collections/{collection_id}`
  - Deletes a collection owned by the current user.
  - Cards in that collection are unassigned (`collection_id = null`).

- `GET /collections/{collection_id}/cards`
  - Returns cards in one owned collection.

### Cards
- `GET /cards`
  - Returns all cards for current user.

- `GET /cards?collection_id=123`
  - Returns cards for one owned collection.

- `POST /cards`
  - Body:
    ```json
    {
      "question": "What is ATP?",
      "answer": "Cell energy currency",
      "collection_id": 123
    }
    ```
  - `collection_id` can be `null`.

- `PUT /cards/{card_id}`
  - Body:
    ```json
    {
      "question": "Updated question",
      "answer": "Updated answer",
      "collection_id": 123
    }
    ```
  - Updates owned card only.

- `DELETE /cards/{card_id}`
  - Deletes owned card only.

## Frontend Changes

Updated files:
- `/Users/GeneralUse/LinuxHome/FlashcardTest/index.html`
- `/Users/GeneralUse/LinuxHome/FlashcardTest/script.js`
- `/Users/GeneralUse/LinuxHome/FlashcardTest/style.css`

Added UI:
- Collection dropdown (`All Collections` + user collections)
- `New Collection` button
- Active collection label

Behavior:
- Cards are fetched according to the selected collection.
- New cards are assigned to selected collection (or unassigned when `All Collections` is selected).

## Deployment Notes

To ship this feature:
1. Redeploy backend service on Render (required).
2. Deploy updated frontend (GitHub Pages or your host) (required for UI feature).
3. Set Supabase auth config on frontend in `/Users/GeneralUse/LinuxHome/FlashcardTest/index.html`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Set backend auth environment variables:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_JWT_SECRET` (required when your project signs auth JWTs with HS256)
   - `SUPABASE_JWT_ISSUER` (optional override, defaults to `${SUPABASE_URL}/auth/v1`)
5. Supabase does not require a separate app redeploy, but DB schema must include new fields/tables (handled by backend startup guard here).

## Local Run (example)

From project root:

```bash
cp .env.example .env
# fill values in .env
uvicorn main:app --reload --env-file .env
```

Then open `index.html` through your static host or local web server.

## Future Improvements Planned
- Add collection editing (rename, change class name)
- Generate practice quizzes based on collections
- Add collection sharing between users (requires more complex permissions)
- Allow bulk card import/export by collection 
- Add collection color coding for easier UI differentiation
- Add dark mode support for better accessibility
