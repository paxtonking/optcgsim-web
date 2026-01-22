import React, { useEffect, useState } from 'react';
import './GameBoard.css';

interface LifeBarProps {
  current: number;
  max: number;
  showCount?: boolean;
}

export const LifeBar: React.FC<LifeBarProps> = ({
  current,
  max,
  showCount = true
}) => {
  const [previousLife, setPreviousLife] = useState(current);
  const [damaged, setDamaged] = useState(false);

  useEffect(() => {
    if (current < previousLife) {
      setDamaged(true);
      const timer = setTimeout(() => setDamaged(false), 300);
      return () => clearTimeout(timer);
    }
    setPreviousLife(current);
  }, [current, previousLife]);

  const pips = Array.from({ length: max }, (_, i) => {
    const isFilled = i < current;
    const classes = [
      'life-bar__pip',
      !isFilled && 'life-bar__pip--empty',
      damaged && i === current && 'life-bar__pip--damaged'
    ].filter(Boolean).join(' ');

    return <div key={i} className={classes} />;
  });

  return (
    <div className="life-bar">
      <div className="life-bar__container">{pips}</div>
      {showCount && (
        <div className="life-bar__count">{current}</div>
      )}
    </div>
  );
};

export default LifeBar;
