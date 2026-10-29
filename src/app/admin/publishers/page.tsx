import { PublishersPanel } from '../panels';

export default function PublishersPage() {
  return (
    <div className="fu">
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-slate-800">Publishers</h2>
        <p className="text-[12px] text-slate-400 mt-0.5">External traffic sources that send clicks to our links — we fire their postback URL when one of their clicks converts.</p>
      </div>
      <PublishersPanel />
    </div>
  );
}
