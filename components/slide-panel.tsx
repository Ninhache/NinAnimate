"use client";

import type React from "react";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Slide } from "./code-animation-slides";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { cn } from "@/lib/utils";

type SlidePanelProps = {
  slides: Slide[];
  currentSlideIndex: number;
  onSlideSelect: (index: number) => void;
  onAddSlide: () => void;
  onDeleteSlide: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onReorderSlides: (startIndex: number, endIndex: number) => void;
};

export default function SlidePanel({
  slides,
  currentSlideIndex,
  onSlideSelect,
  onAddSlide,
  onDeleteSlide,
  onTitleChange,
  onReorderSlides,
}: SlidePanelProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const handleTitleClick = (id: string) => {
    setEditingTitleId(id);
  };

  const handleTitleChange = (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onTitleChange(id, e.target.value);
  };

  const handleTitleBlur = () => {
    setEditingTitleId(null);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setEditingTitleId(null);
    }
  };

  const handleDragEnd = (result: any) => {
    // If the item is being dropped outside the list
    if (!result.destination) {
      return;
    }

    // Reorder the slides according to the new destination
    const startIndex = result.source.index;
    const endIndex = result.destination.index;

    if (startIndex !== endIndex) {
      onReorderSlides(startIndex, endIndex);
    }
  };

  return (
    <>
      <motion.div
        className="bg-gray-800 border-r border-gray-700 overflow-hidden"
        initial={{ width: 250 }}
        animate={{ width: isPanelOpen ? 250 : 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="font-semibold">Slides</h2>
          <Button variant="ghost" size="sm" onClick={onAddSlide}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable
            direction="vertical"
            isDropDisabled={false}
            isCombineEnabled={false}
            ignoreContainerClipping={false}
            droppableId="slides-list"
          >
            {(provided) => (
              <div
                className="overflow-y-auto h-[calc(100vh-10rem)]"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {slides.map((slide, index) => (
                  <Draggable
                    key={slide.id}
                    draggableId={slide.id}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`p-3 border-b border-gray-700 cursor-pointer ${
                          index === currentSlideIndex
                            ? "bg-gray-700"
                            : "hover:bg-gray-750"
                        } ${snapshot.isDragging ? "opacity-70" : ""}`}
                        onClick={() => onSlideSelect(index)}
                      >
                        <div className="flex justify-between items-center">
                          <div
                            className="flex-1 truncate flex items-center"
                            {...provided.dragHandleProps}
                          >
                            {/* Grip icon (still displayed) */}
                            <div className="mr-2 cursor-grab">
                              <GripVertical className="w-3 h-3 opacity-50" />
                            </div>

                            {editingTitleId === slide.id ? (
                              <input
                                value={slide.title}
                                onChange={(e) => handleTitleChange(slide.id, e)}
                                onBlur={handleTitleBlur}
                                onKeyDown={handleTitleKeyDown}
                                autoFocus
                                className="w-full text-sm bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-0 m-0"
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div
                                className="truncate text-sm"
                                onDoubleClick={() => handleTitleClick(slide.id)}
                              >
                                {slide.title}
                              </div>
                            )}
                          </div>

                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-50 hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSlide(slide.id);
                              }}
                              disabled={slides.length <= 1}
                            >
                              <Trash2
                                className={cn("w-3 h-3 transition-opacity", {
                                  "opacity-50": slides.length <= 1,
                                })}
                              />
                            </Button>
                          </div>
                        </div>
                        {/* <div className="mt-1 text-xs text-gray-400 truncate ml-5">
                          {slide.code.split("\n")[0]}
                        </div> */}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </motion.div>

      {/* <Button
        variant="ghost"
        size="icon"
        className="absolute  left-0 top-1/2 transform -translate-y-1/2 z-10 bg-gray-800 border border-gray-700 rounded-r-md rounded-l-none"
        onClick={togglePanel}
      >
        {isPanelOpen ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </Button> */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 
             bg-gray-800 border border-gray-700 rounded-r-md rounded-l-none
             opacity-50 hover:opacity-100"
        onClick={togglePanel}
      >
        {isPanelOpen ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </Button>
    </>
  );
}
