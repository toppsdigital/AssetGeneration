import React from 'react';
import styles from './Spinner.module.css';

const Spinner = () => (
  <div className={styles.spinnerContainer}>
    <div className={styles.spinner} />
    <div>Processing PSD and loading layers...</div>
  </div>
);

export default Spinner; 