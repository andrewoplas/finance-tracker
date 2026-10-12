begin;
create extension if not exists pg_cron with schema pg_catalog;
-- Named jobs are updated in place on a repeated schedule call.
select cron.schedule('finance-recurring-posting','* * * * *','select public.process_due_recurring();');
commit;
