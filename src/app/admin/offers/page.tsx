import { OffersPanel } from '../panels';

export default function OffersPage() {
  return (
    <div className="fu">
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-slate-800">Offers</h2>
        <p className="text-[12px] text-slate-400 mt-0.5">Our offers that publishers run — backed by an advertiser or our own landing page, with the publishers allowed on each.</p>
      </div>
      <OffersPanel />
    </div>
  );
}
