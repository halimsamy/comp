-- Training modules can target custom departments (Member.department is free text).
ALTER TABLE "TrainingModule" ALTER COLUMN "targetDepartments" DROP DEFAULT;
ALTER TABLE "TrainingModule" ALTER COLUMN "targetDepartments" SET DATA TYPE TEXT[] USING "targetDepartments"::TEXT[];
ALTER TABLE "TrainingModule" ALTER COLUMN "targetDepartments" SET DEFAULT ARRAY[]::TEXT[];
