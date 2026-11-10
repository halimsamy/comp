-- pgvector replaces Upstash Vector. Needs the extension available on the server
-- (RDS: supported; Docker: use the pgvector/pgvector image).
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "VectorEmbedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "embedding" vector(1024) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VectorEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VectorEmbedding_organizationId_idx" ON "VectorEmbedding"("organizationId");
