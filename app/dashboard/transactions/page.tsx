import { redirect } from 'next/navigation';
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams({ view: 'transactions' });
  for (const key of ['month', 'filter', 'entry']) if (typeof query[key] === 'string') params.set(key, query[key]);
  redirect(`/dashboard?${params}`);
}
