import { MediaBuyersPanel } from '../panels';

export default function MediaBuyersPage() {
  return (
    <div className="fu">
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-slate-800">Media Buyers</h2>
        <p className="text-[12px] text-slate-400 mt-0.5">Accounts for the team members who log into their own portal to get tracking links and manage their pixel.</p>
      </div>
      <MediaBuyersPanel />
    </div>
  );
}
