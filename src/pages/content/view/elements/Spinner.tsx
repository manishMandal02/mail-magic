type Props = {
  size: 'sm' | 'md' | 'lg';
  color?: string;
};

export const Spinner = ({ size, color = '#10b981' }: Props) => {
  const getSize = () => (size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-8 w-8' : 'h-12 w-12');
  const getBorderSize = () => (size === 'sm' ? '2.5px' : size === 'md' ? '5px' : '8px');

  return (
    <div className='flex w-full h-full items-center justify-center relative'>
      <div
        className={`${getSize()}  animate-spin  rounded-full border-2! border-slate-500! relative `}
        style={{
          border: `${getBorderSize()} solid #f2f0f0`,
          borderTopColor: color,
        }}
      ></div>
    </div>
  );
};
