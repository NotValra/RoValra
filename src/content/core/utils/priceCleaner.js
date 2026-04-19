export const cleanPrice = (priceString) => {
    if (!priceString || typeof priceString !== 'string') {
        return 0;
    }
    const cleaned = priceString.replace(/[^0-9]/g, '');

    return cleaned ? parseInt(cleaned, 10) : 0;
};
