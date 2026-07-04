import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Brain } from '@phosphor-icons/react';

export default function QuickAskButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/qa')}
      aria-label={t('home.askAI')}
      className="btn btn-primary fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform duration-200 hover:scale-110 hover:shadow-xl"
    >
      <Brain size={26} />
    </button>
  );
}
