-- Every new task is due 30 days after it is created (#4, #41), whichever path creates it
-- (API, framework add/sync, org setup). Done tasks get their next review date on completion.
ALTER TABLE "Task" ALTER COLUMN "reviewDate" SET DEFAULT (now() + '30 days'::interval);
