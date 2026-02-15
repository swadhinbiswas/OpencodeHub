
import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";

export type Card = {
    id: string;
    columnId: string;
    contentId?: string | null;
    contentType?: string | null;
    note?: string | null;
    order: number;
};

interface Props {
    card: Card;
    deleteCard?: (id: string) => void;
}

export const KanbanCard: React.FC<Props> = ({ card, deleteCard }) => {
    const {
        setNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: card.id,
        data: {
            type: "Card",
            card,
        },
    });

    const style = {
        transition,
        transform: CSS.Transform.toString(transform),
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="opacity-30 bg-mainBackgroundColor p-2.5 h-[100px] min-h-[100px] items-center flex text-left rounded-xl border-2 border-rose-500 cursor-grab relative"
            />
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="bg-[#21262d] p-2.5 h-[100px] min-h-[100px] items-start flex flex-col justify-center text-left rounded-xl hover:ring-2 hover:ring-inset hover:ring-cyan-500 cursor-grab relative border border-gray-700 group"
        >
            <div className="flex justify-between items-start w-full gap-2">
                <p className="whitespace-pre-wrap text-gray-200 text-sm flex-1">{card.note || "Content"}</p>
                {deleteCard && (
                    <button
                        onMouseDown={(e) => {
                            e.stopPropagation(); // Prevent drag start
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            deleteCard(card.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-opacity rounded"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                )}
            </div>
            {card.contentId && (
                <span className="text-xs text-blue-400 mt-2">Linked to {card.contentType}</span>
            )}
        </div>
    );
};
