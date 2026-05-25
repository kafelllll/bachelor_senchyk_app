import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, Send, Star, User } from 'lucide-react';
import { io } from 'socket.io-client';

import AppHeader from '../components/AppHeader';
import { authService } from '../api/authService';
import { exchangeService } from '../api/exchangeService';
import { messageService, type Conversation, type Message } from '../api/messageService.ts';
import { getNetworkErrorMessage } from '../utils/networkError';
import {
  RATINGS_UPDATED_EVENT,
  extractRatingsUpdatedDetail,
  type RatingsUpdatedDetail,
} from '../utils/ratingsEvents';
import { useRatingsCache } from '../hooks/useRatingsCache';
import { formatRatingLine } from '../utils/ratingsFormat';
import { analyzeAnnouncementQuery } from '../utils/searchNlp';
import { STORAGE_KEYS, removeStorageValue, writeJsonStorageValue } from '../utils/storage';

type DraftConversation = Conversation & {
  isDraft?: boolean;
};

type MessageTarget = {
  userId: string;
  announcementId?: string | null;
  userName?: string;
  userAvatar?: string | null;
  announcementTitle?: string;
};

type StoredConversation = {
  participantId: string;
  participantName?: string;
  participantAvatar?: string | null;
  announcementTitle?: string;
  pendingAnnouncementId?: string | null;
};

const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_BASE_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  'http://localhost:3000';

const buildConversationKey = (participantId: string) => participantId;

const formatTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
};

const extractAnnouncementTitle = (message?: Message | null): string | null =>
  message?.announcementTitle ?? message?.announcement?.plantName ?? null;

const extractAnnouncementFromMessage = (message?: Message | null) => {
  if (!message?.announcementId) return null;
  return {
    id: message.announcementId,
    plantName: extractAnnouncementTitle(message) ?? undefined,
  };
};

const isSameConversation = (
  message: Message,
  participantId: string,
  currentUserId: string | null
) => {
  if (!currentUserId) return false;
  const otherId = message.senderId === currentUserId ? message.receiverId : message.senderId;
  return otherId === participantId;
};

const buildConversationSearchText = (conversation: Conversation) => {
  return [
    conversation.participant.name,
    conversation.lastMessage?.content,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const resolveConversationParticipant = (conversation: Conversation) => {
  const lastMessage = conversation.lastMessage;
  if (!lastMessage) return conversation.participant;

  if (lastMessage.senderId === conversation.participant.id && lastMessage.sender) {
    return {
      ...conversation.participant,
      name: lastMessage.sender.name ?? conversation.participant.name,
      avatar: lastMessage.sender.avatar ?? conversation.participant.avatar,
    };
  }

  if (lastMessage.receiverId === conversation.participant.id && lastMessage.receiver) {
    return {
      ...conversation.participant,
      name: lastMessage.receiver.name ?? conversation.participant.name,
      avatar: lastMessage.receiver.avatar ?? conversation.participant.avatar,
    };
  }

  return conversation.participant;
};

export default function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<DraftConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isStartingExchange, setIsStartingExchange] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [exchangeSuccess, setExchangeSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messageTarget, setMessageTarget] = useState<MessageTarget | null>(null);
  const [pendingAnnouncementId, setPendingAnnouncementId] = useState<string | null>(null);
  const [pendingAnnouncementTitle, setPendingAnnouncementTitle] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(authService.getUserId());

  const nlp = useMemo(() => analyzeAnnouncementQuery(searchQuery), [searchQuery]);
  const effectiveKeywords =
    nlp.keywords.length > 0
      ? nlp.keywords
      : nlp.normalizedQuery
        ? [nlp.normalizedQuery]
        : [];

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeConversationRef = useRef<DraftConversation | null>(null);
  const currentUserIdRef = useRef<string | null>(currentUserId);

  const updateChatSearchParams = (
    participantId: string,
    details?: { name?: string; avatar?: string | null; title?: string; announcementId?: string | null }
  ) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('chatUser', participantId);
    if (details?.announcementId) {
      nextParams.set('announcementId', details.announcementId);
    } else {
      nextParams.delete('announcementId');
      nextParams.delete('announcementTitle');
    }
    if (details?.name) {
      nextParams.set('userName', details.name);
    }
    if (details?.avatar) {
      nextParams.set('userAvatar', details.avatar);
    }
    if (details?.title) {
      nextParams.set('announcementTitle', details.title);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const clearChatSearchParams = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('chatUser');
    nextParams.delete('userId');
    nextParams.delete('announcementId');
    nextParams.delete('userName');
    nextParams.delete('userAvatar');
    nextParams.delete('announcementTitle');
    setSearchParams(nextParams, { replace: true });
  };

  const applyAnnouncementContext = (announcementId?: string | null, title?: string | null) => {
    if (!activeConversation) return;
    const nextId = announcementId ?? null;
    const nextTitle = title ?? null;
    setPendingAnnouncementId(nextId);
    setPendingAnnouncementTitle(nextTitle);
    updateChatSearchParams(activeConversation.participant.id, {
      name: activeConversation.participant.name,
      avatar: activeConversation.participant.avatar ?? null,
      title: nextTitle ?? undefined,
      announcementId: nextId,
    });
  };

  const selectConversation = (
    conversation: Conversation,
    options?: { keepContext?: boolean; title?: string; announcementId?: string | null }
  ) => {
    setActiveConversation(conversation);
    if (options?.keepContext && options?.announcementId) {
      setPendingAnnouncementId(options.announcementId);
      setPendingAnnouncementTitle(options.title ?? null);
      updateChatSearchParams(conversation.participant.id, {
        name: conversation.participant.name,
        avatar: conversation.participant.avatar ?? null,
        title: options.title,
        announcementId: options.announcementId,
      });
      return;
    }

    const fallbackAnnouncementId = conversation.announcement?.id ?? null;
    const fallbackAnnouncementTitle = conversation.announcement?.plantName ?? null;
    setPendingAnnouncementId(fallbackAnnouncementId);
    setPendingAnnouncementTitle(fallbackAnnouncementTitle);
    updateChatSearchParams(conversation.participant.id, {
      name: conversation.participant.name,
      avatar: conversation.participant.avatar ?? null,
      title: fallbackAnnouncementTitle ?? undefined,
      announcementId: fallbackAnnouncementId,
    });
  };

  useEffect(() => {
    const targetUserId = searchParams.get('chatUser') ?? searchParams.get('userId');
    if (!targetUserId) {
      setMessageTarget(null);
      return;
    }

    setMessageTarget({
      userId: targetUserId,
      announcementId: searchParams.get('announcementId'),
      userName: searchParams.get('userName') ?? undefined,
      userAvatar: searchParams.get('userAvatar'),
      announcementTitle: searchParams.get('announcementTitle') ?? undefined,
    });
    setPendingAnnouncementId(searchParams.get('announcementId'));
    setPendingAnnouncementTitle(searchParams.get('announcementTitle'));
  }, [searchParams]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
    if (activeConversation) {
      const announcementTitle = messageTarget?.announcementTitle;
      const payload: StoredConversation = {
        participantId: activeConversation.participant.id,
        participantName: activeConversation.participant.name,
        participantAvatar: activeConversation.participant.avatar ?? null,
        announcementTitle,
        pendingAnnouncementId,
      };
      writeJsonStorageValue(STORAGE_KEYS.activeConversation, payload);
    } else {
      removeStorageValue(STORAGE_KEYS.activeConversation);
    }
  }, [activeConversation, messageTarget?.announcementTitle, pendingAnnouncementId]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    let isMounted = true;
    const syncUserId = async () => {
      const stored = authService.getUserId();
      if (stored) {
        if (isMounted) setCurrentUserId(stored);
        return;
      }

      try {
        const me = await authService.me();
        if (!isMounted) return;
        authService.setUserId(me.id);
        setCurrentUserId(me.id);
      } catch {
        if (isMounted) setCurrentUserId(null);
      }
    };

    syncUserId();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleRatingsUpdated = (event: Event) => {
      const detail = extractRatingsUpdatedDetail(event);
      if (!detail) return;
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.participant.id === detail.userId
            ? {
                ...conversation,
                participant: applySummaryToParticipant(conversation.participant, detail),
              }
            : conversation
        )
      );
      setActiveConversation((prev) =>
        prev && prev.participant.id === detail.userId
          ? { ...prev, participant: applySummaryToParticipant(prev.participant, detail) }
          : prev
      );
    };

    window.addEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    return () => {
      window.removeEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadConversations = async () => {
      try {
        setIsLoadingConversations(true);
        setLoadError(null);
        const response = await messageService.listConversations();
        if (!isMounted) return;
        setConversations(
          response.map((conversation) => {
            if (conversation.announcement) return conversation;
            const announcement = extractAnnouncementFromMessage(conversation.lastMessage);
            return announcement ? { ...conversation, announcement } : conversation;
          })
        );
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setLoadError(message);
      } finally {
        if (isMounted) {
          setIsLoadingConversations(false);
        }
      }
    };

    loadConversations();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const token = authService.getToken();
    if (!token) return undefined;

    const socket = io(SOCKET_BASE_URL, { auth: { token } });

    const handleNewMessage = (message: Message) => {
      const currentUser = currentUserIdRef.current;
      const active = activeConversationRef.current;

      if (!currentUser) return;

      setConversations((prev) => {
        const key = buildConversationKey(
          message.senderId === currentUser ? message.receiverId : message.senderId
        );

        const existingIndex = prev.findIndex(
          (conversation) => buildConversationKey(conversation.participant.id) === key
        );

        const isIncoming = message.senderId !== currentUser;

        if (existingIndex === -1) {
          const announcement = extractAnnouncementFromMessage(message);
          const newConversation: Conversation = {
            participant: message.senderId === currentUser ? message.receiver : message.sender,
            announcement: announcement ?? undefined,
            lastMessage: message,
            unreadCount: isIncoming ? 1 : 0,
          };
          return [newConversation, ...prev];
        }

        const updated = [...prev];
        const existing = updated[existingIndex];
        const isActive =
          active &&
          buildConversationKey(active.participant.id) === key;

        const announcement = extractAnnouncementFromMessage(message);
        updated[existingIndex] = {
          ...existing,
          lastMessage: message,
          announcement: announcement ?? existing.announcement,
          unreadCount: isActive ? 0 : existing.unreadCount + (isIncoming ? 1 : 0),
        };

        updated.sort((a, b) => {
          const aTime = a.lastMessage?.createdAt ?? '';
          const bTime = b.lastMessage?.createdAt ?? '';
          return aTime < bTime ? 1 : -1;
        });

        return updated;
      });

      if (
        active &&
        isSameConversation(message, active.participant.id, currentUser)
      ) {
        setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
      }
    };

    socket.on('message:new', handleNewMessage);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!messageTarget) return;

    const targetKey = buildConversationKey(messageTarget.userId);
    const currentKey = activeConversation
      ? buildConversationKey(activeConversation.participant.id)
      : null;

    if (targetKey === currentKey) {
      if (messageTarget?.announcementId && activeConversation) {
        selectConversation(activeConversation, {
          keepContext: true,
          title: messageTarget.announcementTitle,
          announcementId: messageTarget.announcementId,
        });
      }
      return;
    }

    const existing = conversations.find(
      (conversation) =>
        buildConversationKey(conversation.participant.id) === targetKey
    );

    if (existing) {
      selectConversation(existing, {
        keepContext: Boolean(messageTarget?.announcementId),
        title: messageTarget?.announcementTitle,
        announcementId: messageTarget?.announcementId ?? null,
      });
      return;
    }

    setActiveConversation({
      participant: {
        id: messageTarget.userId,
        name: messageTarget.userName || 'Новий співрозмовник',
        avatar: messageTarget.userAvatar ?? null,
      },
      lastMessage: undefined,
      unreadCount: 0,
      isDraft: true,
    });
  }, [messageTarget, conversations]);

  useEffect(() => {
    if (!activeConversation) {
      setMessages([]);
      return;
    }

    let isMounted = true;

    const loadMessages = async () => {
      try {
        setIsLoadingMessages(true);
        setMessageError(null);
        const response = await messageService.getMessages({
          userId: activeConversation.participant.id,
        });
        if (!isMounted) return;
        setMessages(response);
        setConversations((prev) =>
          prev.map((item) =>
            buildConversationKey(item.participant.id) ===
            buildConversationKey(activeConversation.participant.id)
              ? { ...item, unreadCount: 0 }
              : item
          )
        );
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setMessageError(message);
      } finally {
        if (isMounted) {
          setIsLoadingMessages(false);
        }
      }
    };

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [activeConversation]);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const visibleConversations = useMemo(() => {
    const filtered = conversations.filter((conversation) => {
      if (effectiveKeywords.length === 0) return true;
      const text = buildConversationSearchText(conversation);
      return effectiveKeywords.some((keyword) => text.includes(keyword));
    });

    if (!activeConversation) return filtered;

    const activeKey = buildConversationKey(
      activeConversation.participant.id
    );
    const inList = filtered.some(
      (conversation) =>
        buildConversationKey(conversation.participant.id) === activeKey
    );

    if (inList) return filtered;

    return [activeConversation, ...filtered];
  }, [conversations, activeConversation, effectiveKeywords]);

  const canSend = useMemo(() => {
    const trimmed = draftMessage.trim();
    return Boolean(activeConversation && trimmed.length > 0 && trimmed.length <= 2000 && !isSending);
  }, [activeConversation, draftMessage, isSending]);


  const activeAnnouncementTitle =
    pendingAnnouncementTitle ?? activeConversation?.announcement?.plantName ?? null;
  const activeAnnouncementFallback = pendingAnnouncementId ?? activeConversation?.announcement?.id
    ? `Оголошення: #${pendingAnnouncementId ?? activeConversation?.announcement?.id}`
    : 'Загальний чат';
  const activeParticipant = activeConversation
    ? resolveConversationParticipant(activeConversation)
    : null;
  const messageTargetParticipant =
    activeConversation && messageTarget?.userId === activeConversation.participant.id
      ? {
          name: messageTarget.userName,
          avatar: messageTarget.userAvatar ?? null,
        }
      : null;
  const activeParticipantName =
    messageTargetParticipant?.name || activeParticipant?.name || messageTarget?.userName || 'Користувач';
  const canStartExchange = Boolean(activeConversation && pendingAnnouncementId);

  const ratingUserIds = useMemo(() => {
    const ids = conversations.map((conversation) => conversation.participant.id);
    if (activeConversation?.participant.id) {
      ids.push(activeConversation.participant.id);
    }
    if (messageTarget?.userId) {
      ids.push(messageTarget.userId);
    }
    return ids;
  }, [conversations, activeConversation?.participant.id, messageTarget?.userId]);

  const { ratingsByUserId } = useRatingsCache(ratingUserIds);

  const applySummaryToParticipant = (
    participant: Conversation['participant'],
    detail: RatingsUpdatedDetail
  ) => {
    if (participant.id !== detail.userId) return participant;
    const nextAverage =
      typeof detail.summary.averageRating === 'number'
        ? detail.summary.averageRating
        : participant.averageRating;
    const nextCount =
      typeof detail.summary.ratingsCount === 'number'
        ? detail.summary.ratingsCount
        : participant.ratingsCount;
    const nextCompleted =
      typeof detail.summary.completedExchangesCount === 'number'
        ? detail.summary.completedExchangesCount
        : participant.completedExchangesCount;
    return {
      ...participant,
      averageRating: nextAverage,
      ratingsCount: nextCount,
      completedExchangesCount: nextCompleted,
      rating: participant.rating
        ? { ...participant.rating, averageRating: nextAverage, ratingsCount: nextCount }
        : participant.rating,
    };
  };

  const resolveParticipantRating = (participant?: Conversation['participant']) => {
    if (!participant) {
      return {
        ratingText: formatRatingLine({
          averageRating: null,
          ratingsCount: 0,
          completedExchangesCount: 0,
        }),
      };
    }

    const summary = ratingsByUserId[participant.id];
    const averageRating =
      typeof summary?.averageRating === 'number'
        ? summary.averageRating
        : typeof participant.averageRating === 'number'
          ? participant.averageRating
          : typeof participant.rating?.averageRating === 'number'
            ? participant.rating.averageRating
            : null;
    const ratingsCount =
      typeof summary?.ratingsCount === 'number'
        ? summary.ratingsCount
        : typeof participant.ratingsCount === 'number'
          ? participant.ratingsCount
          : typeof participant.rating?.ratingsCount === 'number'
            ? participant.rating.ratingsCount
            : 0;
    const completedExchangesCount =
      typeof summary?.completedExchangesCount === 'number'
        ? summary.completedExchangesCount
        : typeof participant.completedExchangesCount === 'number'
          ? participant.completedExchangesCount
          : 0;

    return {
      ratingText: formatRatingLine({
        averageRating,
        ratingsCount,
        completedExchangesCount,
      }),
    };
  };

  const handleSend = async () => {
    if (!activeConversation || !canSend) return;

    const content = draftMessage.trim();
    const receiverId = activeConversation.participant.id;

    try {
      setIsSending(true);
      setMessageError(null);
      const response = await messageService.createMessage({
        receiverId,
        announcementId: pendingAnnouncementId ?? undefined,
        content,
      });

      setDraftMessage('');
      setMessages((prev) => (prev.some((item) => item.id === response.id) ? prev : [...prev, response]));
      setConversations((prev) => {
        const key = buildConversationKey(receiverId);
        const existingIndex = prev.findIndex(
          (conversation) => buildConversationKey(conversation.participant.id) === key
        );
        const announcement = extractAnnouncementFromMessage(response);

        if (existingIndex === -1) {
          const newConversation: Conversation = {
            participant: activeConversation.participant,
            lastMessage: response,
            unreadCount: 0,
          };
          return [newConversation, ...prev];
        }

        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          lastMessage: response,
          announcement: announcement ?? updated[existingIndex].announcement,
          unreadCount: 0,
        };

        return updated;
      });

      if (activeConversation.isDraft) {
        setActiveConversation((prev: DraftConversation | null) =>
          prev ? { ...prev, isDraft: false } : prev
        );
      }

      if (response.announcementId) {
        applyAnnouncementContext(response.announcementId, extractAnnouncementTitle(response));
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setMessageError(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (!activeConversation) return;

    try {
      setIsDeleting(true);
      setDeleteError(null);
      await messageService.deleteConversation({
        userId: activeConversation.participant.id,
      });

      const keyToRemove = buildConversationKey(
        activeConversation.participant.id
      );

      setConversations((prev) =>
        prev.filter(
          (conversation) =>
            buildConversationKey(conversation.participant.id) !==
            keyToRemove
        )
      );
      setMessages([]);
      setActiveConversation(null);
      setMessageTarget(null);
      clearChatSearchParams();
      setShowDeleteModal(false);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartExchange = async () => {
    if (!activeConversation || !pendingAnnouncementId) return;
    try {
      setIsStartingExchange(true);
      setExchangeError(null);
      setExchangeSuccess(null);
      await exchangeService.create({
        announcementId: pendingAnnouncementId,
        receiverId: activeConversation.participant.id,
      });
      setExchangeSuccess('Обмін ініційовано. Перейдіть у розділ "Мої обміни".');
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setExchangeError(message);
    } finally {
      setIsStartingExchange(false);
    }
  };

  useEffect(() => {
    setExchangeError(null);
    setExchangeSuccess(null);
  }, [activeConversation?.participant.id, pendingAnnouncementId]);

  const handleBackToConversationList = () => {
    setActiveConversation(null);
    setMessages([]);
    setMessageTarget(null);
    setPendingAnnouncementId(null);
    setPendingAnnouncementTitle(null);
    clearChatSearchParams();
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-neutral-50">
      <AppHeader />

      {showDeleteModal && activeConversation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Видалити діалог?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Це видалить всі повідомлення з
              <span className="font-semibold"> {activeConversation.participant.name || 'користувачем'}</span>.
            </p>
            {deleteError ? (
              <p className="mt-3 text-sm text-red-600">{deleteError}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-slate-700 hover:bg-gray-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleDeleteConversation}
                disabled={isDeleting}
                className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDeleting ? 'Видаляємо...' : 'Видалити'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="app-layout min-h-[calc(100vh-88px)] w-full overflow-x-hidden px-4 py-6 sm:px-6 lg:h-[calc(100vh-88px)] lg:px-8">
        <div className="mx-auto grid w-full max-w-[1452px] overflow-x-hidden gap-6 lg:h-full lg:grid-cols-[340px_1fr]">
          <aside
            className={`relative z-10 min-h-0 flex-col rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm lg:h-full ${
              activeConversation ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Пошук діалогу"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-green-500"
              />
            </div>

            {isLoadingConversations ? (
              <div className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                Завантажуємо діалоги...
              </div>
            ) : loadError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
                {loadError}
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                Діалоги відсутні. Напишіть користувачу через оголошення.
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto">
                {visibleConversations.map((conversation: Conversation) => {
                  const isActive =
                    activeConversation &&
                    buildConversationKey(activeConversation.participant.id) ===
                      buildConversationKey(conversation.participant.id);
                  const resolvedParticipant = resolveConversationParticipant(conversation);
                  const conversationAnnouncement = conversation.announcement?.plantName
                    ? `Оголошення: ${conversation.announcement.plantName}`
                    : conversation.announcement?.id
                      ? `Оголошення: #${conversation.announcement.id}`
                      : 'Загальний чат';
                  const ratingInfo = resolveParticipantRating(conversation.participant);

                  return (
                    <button
                      key={buildConversationKey(conversation.participant.id)}
                      type="button"
                      onClick={() => {
                        selectConversation(conversation);
                      }}
                      className={`flex min-w-0 w-full flex-col overflow-hidden rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 bg-white hover:border-green-200 hover:bg-green-50/60'
                      }`}
                    >
                      <div className="flex w-full min-w-0 items-start justify-between gap-2">
                        <div className="flex w-full min-w-0 flex-1 items-center gap-3 overflow-hidden">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                            {resolvedParticipant.avatar ? (
                              <img
                                src={resolvedParticipant.avatar}
                                alt={resolvedParticipant.name}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <User className="h-4 w-4 text-emerald-700" />
                            )}
                          </div>
                          <div className="min-w-0 w-full flex-1">
                            <p className="text-clamp-1 text-base font-semibold text-slate-900">
                              {resolvedParticipant.name || 'Користувач'}
                            </p>
                            <div className="mt-1 flex min-w-0 items-center gap-1 text-sm text-slate-600">
                              <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                              <span className="min-w-0 text-clamp-1">{ratingInfo.ratingText}</span>
                            </div>
                            <p className="mt-1 text-clamp-2 text-sm leading-6 text-slate-500 break-words">
                              {conversationAnnouncement}
                            </p>
                          </div>
                        </div>
                        {conversation.unreadCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section
            className={`relative z-0 min-h-0 flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm lg:h-full ${
              activeConversation ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
              {activeConversation ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <button
                      type="button"
                      onClick={handleBackToConversationList}
                      className="mb-1 inline-flex w-fit items-center gap-1 rounded-lg px-1 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      До списку
                    </button>
                    <Link
                      to={`/users/${activeConversation.participant.id}`}
                      className="-m-2 block min-w-0 rounded-xl p-2 transition hover:bg-green-50/60"
                    >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
                        {messageTargetParticipant?.avatar || activeParticipant?.avatar ? (
                          <img
                            src={messageTargetParticipant?.avatar ?? activeParticipant?.avatar ?? ''}
                            alt={messageTargetParticipant?.name ?? activeParticipant?.name ?? ''}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          <User className="h-5 w-5 text-emerald-700" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-clamp-1 text-base font-semibold text-slate-900">
                          {activeParticipantName}
                        </p>
                        <div className="mt-1 flex min-w-0 items-center gap-1 text-sm text-slate-600">
                          <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                          <span className="min-w-0 text-clamp-1">{resolveParticipantRating(activeConversation.participant).ratingText}</span>
                        </div>
                        <div className="mt-1">
                          <p className="text-clamp-1 text-sm leading-relaxed text-slate-500">
                            {activeAnnouncementTitle
                              ? `Оголошення: ${activeAnnouncementTitle}`
                              : activeAnnouncementFallback}
                          </p>
                          
                        </div>
                      </div>
                    </div>
                    </Link>
                  </div>
                  <div className="flex w-full items-center justify-end sm:w-auto">
                    <button
                      type="button"
                      onClick={handleStartExchange}
                      disabled={!canStartExchange || isStartingExchange}
                      className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition sm:w-auto sm:px-6 sm:text-sm ${
                        !canStartExchange || isStartingExchange
                          ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                          : 'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95'
                      }`}
                    >
                      {isStartingExchange ? 'Створюємо...' : 'Запропонувати обмін'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-base font-semibold text-slate-900">Оберіть діалог</p>
                  <p className="text-sm text-slate-500">
                    Клікніть на користувача, щоб відкрити листування.
                  </p>
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-slate-50 px-4 py-4 sm:px-6">
              {activeConversation ? (
                isLoadingMessages ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                    Завантажуємо повідомлення...
                  </div>
                ) : messageError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-center text-sm text-red-700">
                    {messageError}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                    Напишіть перше повідомлення, щоб почати діалог.
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-2">
                    {messages.map((message) => {
                      const isMine = message.senderId === currentUserId;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-left text-sm shadow-sm break-words sm:max-w-[70%] lg:max-w-[60%] ${
                              isMine
                                ? 'bg-green-100 text-green-900'
                                : 'bg-white text-slate-700'
                            }`}
                          >
                            <div className="flex flex-col gap-1">
                              <p className="whitespace-pre-wrap break-words">{message.content}</p>
                              <p className={`text-[11px] leading-tight ${isMine ? 'text-emerald-100' : 'text-slate-400'}`}>
                                {formatTime(message.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                  Оберіть діалог зі списку, щоб почати спілкування.
                </div>
              )}
              {activeConversation && exchangeError ? (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {exchangeError}
                </div>
              ) : null}
              {activeConversation && exchangeSuccess ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {exchangeSuccess}
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-2">
                <textarea
                  rows={2}
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder="Напишіть повідомлення..."
                  className="min-h-[60px] w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-green-500"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">{draftMessage.trim().length}/2000</p>
                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={handleSend}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2e7d32] to-[#49b04d] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    <Send className="h-4 w-4" />
                    Надіслати
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
