# App Review AI — Weekly Pulse

App Review AI is an automated pipeline that imports public reviews from the App Store and Play Store, clusters them using UMAP + HDBSCAN, and uses Groq (Llama-3.3-70b) to generate a Weekly Pulse Report.

The report includes the top themes, validated user quotes, and actionable product ideas. It is delivered via a locally-run pipeline to a Google Doc, drafts an email, and powers a React-based Vercel dashboard.

## How to Re-Run for a New Week

The pipeline tracks runs by ISO Week to prevent duplicate deliveries. To run the pipeline for the current week:

1. Open your terminal in the root of the project.
2. Ensure your `.env` is configured with `PULSE_LLM_API_KEY`, `GOOGLE_DOC_ID`, and `PULSE_DELIVERY_EMAIL_RECIPIENTS`.
3. Run the following command:
   ```bash
   npm run pulse:run
   ```
4. Wait for the pipeline to finish fetching, clustering, and summarizing.
5. Push the updated data to Vercel to update the dashboard:
   ```bash
   git add dashboard/public/data/
   git commit -m "chore: update weekly pulse data"
   git push
   ```

### Backfilling Past Weeks
To manually backfill a previous week without sending a new email, use the CLI's backfill command with the `--dry-run` flag:
```bash
npx tsx src/cli.ts backfill --year 2026 --week <WEEK_NUMBER> --dry-run
```

## Theme Legend

The AI dynamically clusters user reviews into up to 5 recurring themes. Below is a legend of the typical themes identified in recent pulses for Groww:

* **Feature Requests And Issues:** Users asking for missing technical indicators (e.g., stochastic indicators) or reporting order execution bugs/app freezing.
* **Ease of Use / Easy Investment Experience:** Positive feedback praising the beginner-friendly UI, intuitive onboarding, and seamless stock/mutual fund tracking.
* **High Brokerage Charges:** Complaints regarding unexpected fees, increased brokerage charges per trade, or comparisons to competitors.
* **Poor Customer Support:** Frustrations with slow resolution times, unhelpful automated replies, and lack of accessible technical support.
* **Account/KYC Friction:** (When applicable) Reviews related to difficulties uploading documents, verifying bank accounts, or unblocking disabled accounts.

---
*Note: A sample of 100 raw, normalized reviews used in the generation of these reports is available in `sample_reviews.csv`.*
