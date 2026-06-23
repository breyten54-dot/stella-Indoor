import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { ADDON_ITEMS } from '@/data/constants';
import type { Addons } from '@/types/booking';

interface AddonSelectionProps {
  addons: Addons;
  onUpdate: (addonId: keyof Addons, quantity: number) => void;
}

export function AddonSelection({ addons, onUpdate }: AddonSelectionProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight">
          Add Extras
        </h1>
        <p className="text-[#8A8A8A] mt-2 text-base">
          Optional equipment and services for your session
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 max-w-3xl mx-auto">
        {ADDON_ITEMS.map((addon, index) => {
          const quantity = addons[addon.id];
          return (
            <motion.div
              key={addon.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
              className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden hover:shadow-lg transition-shadow duration-300"
            >
              <div className="h-32 bg-[#E8F5EC] flex items-center justify-center overflow-hidden">
                <img
                  src={addon.image}
                  alt={addon.name}
                  className="h-full w-full object-contain p-4"
                  loading="lazy"
                />
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-[#0A0A0A]">{addon.name}</h3>
                  <p className="text-sm text-[#8A8A8A]">{addon.description}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-[#1B7A40] tab-nums">R{addon.price}</span>

                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-[#E0E0D8] rounded-lg h-10 overflow-hidden">
                    <button
                      className="w-10 h-full flex items-center justify-center text-[#8A8A8A] hover:bg-[#F5F5F0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:bg-[#E8E8E0]"
                      disabled={quantity <= 0}
                      onClick={() => onUpdate(addon.id, quantity - 1)}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="w-10 h-full flex items-center justify-center border-x border-[#E0E0D8] bg-white">
                      <span className="text-sm font-bold tab-nums">{quantity}</span>
                    </div>
                    <button
                      className="w-10 h-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F5F5F0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:bg-[#E8E8E0]"
                      disabled={quantity >= 10}
                      onClick={() => onUpdate(addon.id, quantity + 1)}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {addons.soccerBall === 0 && addons.bibs === 0 && (
        <p className="text-center text-sm text-[#8A8A8A]">
          No extras selected — that's fine, you can skip this step
        </p>
      )}
    </div>
  );
}
