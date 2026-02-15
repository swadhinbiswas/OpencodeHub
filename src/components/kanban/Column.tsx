
import React, { useMemo, useState } from "react";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Card, KanbanCard } from "./Card";
import { Plus } from "lucide-react";

export type Column = {
    id: string;
    name: string;
    order: number;
}; // & cards: Card[] in parent

interface Props {
    column: Column & { cards: Card[] };
    createCard: (columnId: string, note: string) => void;
    deleteCard: (cardId: string) => void;
}

export const KanbanColumn: React.FC<Props> = ({ column, createCard, deleteCard }) => {
    const {
        setNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: column.id,
        data: {
            type: "Column",
            column,
        },
    });

    const [isCreating, setIsCreating] = useState(false);
    const [newCardNote, setNewCardNote] = useState("");

    const handleCreateCard = () => {
        if (newCardNote.trim()) {
            createCard(column.id, newCardNote);
            setNewCardNote("");
            setIsCreating(false);
        }
    };

    const style = {
        transition,
        transform: CSS.Transform.toString(transform),
    };

    const cardIds = useMemo(() => {
        return column.cards.map((card) => card.id);
    }, [column.cards]);

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="bg-columnBackgroundColor opacity-40 border-2 border-pink-500 w-[350px] h-[500px] max-h-[500px] rounded-md flex flex-col"
            ></div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="bg-[#161b22] w-[350px] h-[500px] max-h-[500px] rounded-md flex flex-col border border-gray-800"
        >
            <div
                {...attributes}
                {...listeners}
                onClick={() => { }}
                className="bg-[#0d1117] text-md h-[60px] cursor-grab rounded-md rounded-b-none p-3 font-bold border-b border-gray-800 flex items-center justify-between"
            >
                <div className="flex gap-2 text-gray-200">
                    {column.name}
                    <span className="flex justify-center items-center bg-gray-800 px-2 py-1 text-sm rounded-full text-gray-400">
                        {column.cards.length}
                    </span>
                </div>
            </div>

            <div className="flex flex-grow flex-col gap-4 p-2 overflow-x-hidden overflow-y-auto">
                <SortableContext items={cardIds}>
                    {column.cards.map((card) => (
                        <KanbanCard key={card.id} card={card} deleteCard={deleteCard} />
                    ))}
                </SortableContext>
            </div>

            <div className="p-2 border-t border-gray-800">
                {!isCreating ? (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex gap-2 items-center border-columnBackgroundColor border-2 rounded-md p-4 border-x-columnBackgroundColor hover:bg-mainBackgroundColor hover:text-rose-500 active:bg-black w-full"
                    >
                        <Plus />
                        Add task
                    </button>
                ) : (
                    <div className="flex gap-2 items-center p-2">
                        <input
                            autoFocus
                            className="bg-[#0d1117] border border-gray-700 rounded p-2 w-full text-white"
                            placeholder="Card content..."
                            value={newCardNote}
                            onChange={(e) => setNewCardNote(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateCard();
                                if (e.key === "Escape") setIsCreating(false);
                            }}
                        />
                        <button onClick={handleCreateCard} className="text-green-400 font-bold p-2">Add</button>
                        <button onClick={() => setIsCreating(false)} className="text-gray-500 p-2">X</button>
                    </div>
                )}
            </div>
        </div>
    );
};
