-- Quién mandó la señal y el asunto (correos), para verlos en la ficha.
ALTER TABLE "senal" ADD COLUMN "remitente" TEXT,
ADD COLUMN "asunto" TEXT;
