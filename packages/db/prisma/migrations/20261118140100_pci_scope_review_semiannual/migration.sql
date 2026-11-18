-- PCI DSS 12.5.2.1: service providers confirm scope at least every six months.
UPDATE "FrameworkEditorTaskTemplate"
SET "frequency" = 'semiannually'
WHERE "id" = 'frk_tt_69dd3f6094fc732d635210ae' AND "frequency" = 'yearly';

UPDATE "Task"
SET "frequency" = 'semiannually'
WHERE "taskTemplateId" = 'frk_tt_69dd3f6094fc732d635210ae' AND "frequency" = 'yearly';
