import { ConversionsPanel } from '../panels';

export default function PostbacksPage() {
  return (
    <div className="fu">
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-slate-800">Postbacks</h2>
        <p className="text-[12px] text-slate-400 mt-0.5">Raw conversion events advertisers have sent back to us.</p>
      </div>
      <ConversionsPanel />
    </div>
  );
}
