"use client";

interface AdSlotProps {
  position: "top" | "mid" | "bottom" | "sidebar";
  className?: string;
}

export default function AdSlot({ position, className = "" }: AdSlotProps) {
  return (
    <div
      className={`${className} text-center`}
      data-ad-position={position}
    >
      <div className="border border-dashed border-[#333] py-4 text-[#444] text-[10px] tracking-[0.3em] uppercase">
        ADS
      </div>
    </div>
  );
}
