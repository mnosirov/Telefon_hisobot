const LoadingSpinner = ({ size = 'md', text = 'Yuklanmoqda...' }) => {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className={`${sizes[size]} border-4 border-dark-200 dark:border-dark-600 border-t-primary-500 rounded-full animate-spin`} />
      {text && <p className="text-sm text-dark-400">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
