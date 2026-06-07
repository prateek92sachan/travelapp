import { useEffect, useRef, useState } from 'react';
import { EMPTY_ADD_FORM } from './constants';

export function useWishlistTabState({ activeList, mode, setMode, onRename, onDelete, onSelect }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [editingName, setEditingName] = useState(false);
  const [editValue, setEditValue] = useState(activeList?.name || '');

  const longPressTimer = useRef(null);
  const didLongPress = useRef(false);
  const addFormRef = useRef(null);
  const editInputRef = useRef(null);

  useEffect(() => {
    if (showAddForm && addFormRef.current) {
      addFormRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [showAddForm]);

  useEffect(() => {
    setEditValue(activeList?.name || '');
    setEditingName(false);
  }, [activeList?.id, activeList?.name]);

  useEffect(() => {
    if (editingName) editInputRef.current?.focus();
  }, [editingName]);

  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  function commitRename() {
    if (!activeList) return;
    const next = editValue.trim();
    if (next && next !== activeList.name) onRename(activeList.id, next);
    setEditingName(false);
  }

  function cancelRename() {
    setEditValue(activeList?.name || '');
    setEditingName(false);
  }

  function confirmDelete() {
    if (!activeList) return;
    if (window.confirm(`Delete "${activeList.name}"? This removes the list and its saved places.`)) {
      onDelete(activeList.id);
    }
  }

  function handleChipPointerDown() {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setPickerOpen(true);
    }, 500);
  }

  function handleChipPointerUp() {
    clearTimeout(longPressTimer.current);
  }

  function handleChipClick(listId) {
    if (!didLongPress.current) onSelect(listId);
  }

  return {
    pickerOpen, setPickerOpen,
    showAddForm, setShowAddForm,
    addForm, setAddForm,
    mode, setMode,
    editingName, setEditingName,
    editValue, setEditValue,
    addFormRef, editInputRef,
    commitRename, cancelRename, confirmDelete,
    handleChipPointerDown, handleChipPointerUp, handleChipClick,
  };
}
