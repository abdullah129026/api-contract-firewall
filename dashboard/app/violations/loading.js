// Loading state for the violation stream.
import { TableSkeleton } from '../../components/Skeleton.js';

export default function Loading() {
  return (
    <>
      <div className="skeleton" style={{ height: 30, width: 180, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 14, width: '55%', marginBottom: 28 }} />
      <TableSkeleton />
    </>
  );
}
