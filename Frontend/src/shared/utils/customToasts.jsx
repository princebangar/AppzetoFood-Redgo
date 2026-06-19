import React from "react";
import { Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const showAccountDeletedToast = () => {
  toast.custom((t) => (
    <div className="flex items-center gap-3 bg-[#f0fdf4] border border-[#bbf7d0] px-4 py-3 rounded-xl shadow-lg min-w-[300px] animate-in fade-in slide-in-from-top-4">
      <div className="relative">
        <Trash2 className="w-6 h-6 text-[#ef4444]" />
        <div className="absolute -top-1 -right-1 bg-white rounded-full">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] fill-[#22c55e] stroke-white" />
        </div>
      </div>
      <p className="text-[#15803d] font-bold text-sm">Account Deleted successfully</p>
    </div>
  ), {
    duration: 4000,
  });
};
