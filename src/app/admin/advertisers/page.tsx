import { AdvertisersPanel } from '../panels';

export default function AdvertisersPage() {
  return (
    <div className="fu">
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-slate-800">Advertisers</h2>
        <p className="text-[12px] text-slate-400 mt-0.5">External offers we send traffic to, and where their server-to-server postback lands.</p>
      </div>
      <AdvertisersPanel />
    </div>
  );
}
