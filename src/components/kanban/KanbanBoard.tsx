
import React, { useMemo, useState } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    type DragStartEvent,
    type DragOverEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { KanbanColumn, type Column as ColumnType } from "./Column";
import { KanbanCard, type Card as CardType } from "./Card";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
    project: any;
    initialColumns: (ColumnType & { cards: CardType[] })[];
}

export const KanbanBoard: React.FC<Props> = ({ project, initialColumns }) => {
    const [columns, setColumns] = useState(initialColumns);
    const [activeColumn, setActiveColumn] = useState<(ColumnType & { cards: CardType[] }) | null>(null);
    const [activeCard, setActiveCard] = useState<CardType | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 3, // 3px movement required to start drag
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const columnIds = useMemo(() => columns.map((col) => col.id), [columns]);

    function onDragStart(event: DragStartEvent) {
        if (event.active.data.current?.type === "Column") {
            setActiveColumn(event.active.data.current.column as (ColumnType & { cards: CardType[] }));
            return;
        }

        if (event.active.data.current?.type === "Card") {
            setActiveCard(event.active.data.current.card);
            return;
        }
    }


    function onDragEnd(event: DragEndEvent) {
        setActiveColumn(null);
        setActiveCard(null);

        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        if (activeId === overId) return;

        const isActiveColumn = active.data.current?.type === "Column";
        if (isActiveColumn) {
            setColumns((columns) => {
                const activeIndex = columns.findIndex((col) => col.id === activeId);
                const overIndex = columns.findIndex((col) => col.id === overId);

                const newCols = arrayMove(columns, activeIndex, overIndex);

                // Save new order to backend
                updateOrder("column", newCols.map((col, idx) => ({ id: col.id, order: idx })));

                return newCols;
            });
        }

        // Handle Card Drop Persistence
        const isActiveCard = active.data.current?.type === "Card";
        if (isActiveCard) {
            // We need to find the column of the active card in the *current* state (which was updated by onDragOver)
            // But onDragEnd acts on the state. 
            // Better strategy: We can assume setColumns in onDragOver updated the local state correctly.
            // We just need to trigger the save.

            // Find the column containing the moved card
            const activeColumn = columns.find(col => col.cards.some(c => c.id === activeId));
            if (activeColumn) {
                // Save new order for this column
                // Note: If we moved between columns, we theoretically should save BOTH columns,
                // but our API 'move' endpoint might be simpler if we send the full list for the TARGET column.
                // Or if we send just one card move.

                // Our move API "card" type expects: { items: [...], columnId: ... }
                // So we send the full list of the target column.

                updateOrder("card", activeColumn.cards.map((c, i) => ({ id: c.id, order: i, columnId: activeColumn.id })), activeColumn.id);
            }
        }
    }

    function onDragOver(event: DragOverEvent) {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        if (activeId === overId) return;

        const isActiveCard = active.data.current?.type === "Card";
        const isOverCard = over.data.current?.type === "Card";
        const isOverColumn = over.data.current?.type === "Column";

        if (!isActiveCard) return;

        // Moving a card over another card
        if (isActiveCard && isOverCard) {
            setColumns((columns) => {
                const activeColumnIndex = columns.findIndex((col) =>
                    col.cards.some((card) => card.id === activeId)
                );
                const overColumnIndex = columns.findIndex((col) =>
                    col.cards.some((card) => card.id === overId)
                );

                if (activeColumnIndex === -1 || overColumnIndex === -1) return columns;

                const activeColumn = columns[activeColumnIndex];
                const overColumn = columns[overColumnIndex];

                const activeCardIndex = activeColumn.cards.findIndex(
                    (card) => card.id === activeId
                );
                const overCardIndex = overColumn.cards.findIndex(
                    (card) => card.id === overId
                );

                if (activeColumnIndex === overColumnIndex) {
                    // Same column reorder
                    const newCards = arrayMove(activeColumn.cards, activeCardIndex, overCardIndex);
                    const newColumns = [...columns];
                    newColumns[activeColumnIndex] = { ...activeColumn, cards: newCards };

                    // We usually wait for DragEnd to sync, but for visual we simplify updates here.
                    return newColumns;
                }

                // Different column
                const newActiveCards = [...activeColumn.cards];
                const [movedCard] = newActiveCards.splice(activeCardIndex, 1);

                const newOverCards = [...overColumn.cards];
                // Insert before or after based on direction could be tricky, for simplicity insert at over index
                newOverCards.splice(overCardIndex, 0, movedCard);

                const newColumns = [...columns];
                newColumns[activeColumnIndex] = { ...activeColumn, cards: newActiveCards };
                newColumns[overColumnIndex] = { ...overColumn, cards: newOverCards };

                return newColumns;
            });
        }

        // Moving a card over a column (empty or not)
        if (isActiveCard && isOverColumn) {
            setColumns((columns) => {
                const activeColumnIndex = columns.findIndex((col) =>
                    col.cards.some((card) => card.id === activeId)
                );
                const overColumnIndex = columns.findIndex((col) => col.id === overId);

                if (activeColumnIndex === overColumnIndex) return columns;
                if (activeColumnIndex === -1 || overColumnIndex === -1) return columns;

                const activeColumn = columns[activeColumnIndex];
                const overColumn = columns[overColumnIndex];

                const activeCardIndex = activeColumn.cards.findIndex((card) => card.id === activeId);
                const newActiveCards = [...activeColumn.cards];
                const [movedCard] = newActiveCards.splice(activeCardIndex, 1);

                const newOverCards = [...overColumn.cards];
                newOverCards.push(movedCard); // Add to end

                const newColumns = [...columns];
                newColumns[activeColumnIndex] = { ...activeColumn, cards: newActiveCards };
                newColumns[overColumnIndex] = { ...overColumn, cards: newOverCards };

                return newColumns;
            });
        }
    }

    // Finalize card drop (save to backend)
    // This is simplified. Proper DnD needs careful handling of DragOver vs DragEnd source of truth.
    // For this demo, we'll implement a debounced save in DragOver or use DragEnd for final sync?
    // Actually, easiest is to capture the final state in DragEnd for cross-column too?
    // DragOver mutates state for visual feedback. DragEnd confirms it.
    // But DragEnd only fires if we dropped.
    // The logic in onDragEnd for cards:

    /*
      function onDragEnd(event: DragEndEvent) {
        ...
        if (isActiveCard) {
            // Find where it ended up
            const activeColumn = columns.find(col => col.cards.some(c => c.id === activeId));
            if (activeColumn) {
                 const cardIndex = activeColumn.cards.findIndex(c => c.id === activeId);
                 // Sync with backend
            }
        }
      }
    */

    async function updateOrder(type: "column" | "card", items: any[], columnId?: string) {
        try {
            await fetch(`/api/projects/${project.id}/move`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, items, columnId })
            });
        } catch (e) {
            console.error("Failed to sync order", e);
        }
    }

    // Create columns
    async function createColumn() {
        const name = prompt("Column name:");
        if (!name) return;

        try {
            const res = await fetch(`/api/projects/${project.id}/columns`, {
                method: "POST",
                body: JSON.stringify({ name }),
                headers: { "Content-Type": "application/json" }
            });
            const newCol = await res.json();
            setColumns([...columns, { ...newCol.data, cards: [] }]);
            toast.success("Column created");
        } catch (e) {
            toast.error("Failed to create column");
        }
    }

    async function createCard(columnId: string, note: string) {
        if (!note) return;
        try {
            const res = await fetch(`/api/projects/${project.id}/cards`, {
                method: "POST",
                body: JSON.stringify({ columnId, note }),
                headers: { "Content-Type": "application/json" }
            });
            const newCard = await res.json();

            setColumns(cols => cols.map(col => {
                if (col.id === columnId) {
                    return { ...col, cards: [newCard.data, ...col.cards] };
                }
                return col;
            }));
            toast.success("Card created");
        } catch (e) {
            toast.error("Failed to create card");
        }
    }

    async function deleteCard(cardId: string) {
        try {
            await fetch(`/api/projects/${project.id}/cards/${cardId}`, {
                method: "DELETE"
            });
            setColumns(cols => cols.map(col => ({
                ...col,
                cards: col.cards.filter(c => c.id !== cardId)
            })));
            toast.success("Card deleted");
        } catch (e) {
            toast.error("Failed to delete card");
        }
    }

    return (
        <div
            className="flex h-full w-full overflow-x-auto overflow-y-hidden px-4 md:px-8 pb-4"
        >
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
            >
                <div className="flex gap-4">
                    <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
                        {columns.map((col) => (
                            <KanbanColumn
                                key={col.id}
                                column={col}
                                createCard={createCard}
                                deleteCard={deleteCard}
                            />
                        ))}
                    </SortableContext>

                    <button
                        onClick={createColumn}
                        className="h-[50px] w-[350px] min-w-[350px] cursor-pointer rounded-lg bg-mainBackgroundColor border-2 border-columnBackgroundColor p-4 ring-rose-500 hover:ring-2 flex gap-2"
                    >
                        <Plus /> Add Column
                    </button>
                </div>

                {createPortal(
                    <DragOverlay>
                        {activeColumn && (
                            <KanbanColumn
                                column={activeColumn}
                                createCard={createCard}
                                deleteCard={deleteCard}
                            />
                        )}
                        {activeCard && <KanbanCard card={activeCard} />}
                    </DragOverlay>,
                    document.body
                )}
            </DndContext>
        </div>
    );
};
