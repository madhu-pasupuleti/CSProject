import { LightningElement } from 'lwc';
import fetchIdInfo from '@salesforce/apex/SAIDCheckerController.fetchIdInfo';

export default class SouthafricanIDCheckerLWC extends LightningElement {
    idNumber = '';
    isButtonDisabled = true;
    result;
    error;

    get inputClass() {
        return this.idNumber.length === 13 && !this.isValidSAID(this.idNumber) ? 'slds-has-error' : '';
    }

    handleInput(event) {
        this.idNumber = event.target.value.replace(/\D/g, ''); // only digits
        this.error = null;
        console.log('handleInput - current idNumber:', this.idNumber);

        const inputField = event.target;
        const length = this.idNumber.length;

        if (length === 0) {
            inputField.setCustomValidity('');
            this.isButtonDisabled = true;
            console.log('Input length 0 - button disabled');
        } else if (length < 13) {
            inputField.setCustomValidity('');
            this.isButtonDisabled = true;
            console.log('Input length less than 13 - button disabled');
        } else if (length === 13) {
            const isValid = this.isValidSAID(this.idNumber);
            console.log('Input length 13 - Valid SA ID?', isValid);
            if (!isValid) {
                inputField.setCustomValidity('Invalid SA ID Number. It must be a valid 13-digit ID.');
                console.log('Invalid SA ID format');
            } else {
                inputField.setCustomValidity('');
                console.log('Valid SA ID format');
            }
            this.isButtonDisabled = !isValid;
        }

        inputField.reportValidity();
    }

    handleSearch() {
        console.log('handleSearch - idNumber:', this.idNumber);
        const inputField = this.template.querySelector('lightning-input');

        if (!this.isValidSAID(this.idNumber)) {
            inputField.setCustomValidity('Invalid SA ID Number. Please enter a valid 13-digit ID.');
            inputField.reportValidity();
            this.result = null;
            console.log('Search aborted - invalid SA ID');
            return;
        }

        inputField.setCustomValidity('');
        inputField.reportValidity();

        fetchIdInfo({ idNumber: this.idNumber })
            .then((res) => {
                console.log('fetchIdInfo success response:', res);
                if (res && res.dob && res.gender && res.holidays && res.holidays.length > 0) {
                    res.holidays = res.holidays.map(holiday => {
                        return {
                            ...holiday,
                            date: new Date(holiday.date).toISOString().split('T')[0]
                        };
                    });
                    this.result = res;
                    this.error = null;
                    console.log('Result updated with holidays');
                } else {
                    this.result = null;
                    this.error = 'Invalid response from the API or no holidays found.';
                    console.log('No holidays found or invalid response');
                }
            })
            .catch((err) => {
                this.error = err.body?.message || 'An error occurred';
                this.result = null;
                console.error('fetchIdInfo error:', this.error);
            });
    }

    handleClear() {
        console.log('handleClear triggered');
        this.idNumber = '';
        this.result = null;
        this.error = null;
        this.isButtonDisabled = true;

        const input = this.template.querySelector('lightning-input');
        if (input) {
            input.value = '';
            input.setCustomValidity('');
            input.reportValidity();
        }
    }

    get showClearButton() {
        return this.result != null;
    }

    get isClearDisabled() {
        return !this.result;
    }

    isValidSAID(id) {
        if (!/^\d{13}$/.test(id)) return false;

        const dob = id.substring(0, 6);
        const genderSection = parseInt(id.substring(6, 10), 10);
        const citizenship = id[10];
        const year = parseInt(dob.substring(0, 2), 10);
        const month = parseInt(dob.substring(2, 4), 10);
        const day = parseInt(dob.substring(4, 6), 10);
        const currentYear = new Date().getFullYear();
        const fullYear = year + (year <= currentYear % 100 ? 2000 : 1900);

        if (!this.isValidDate(fullYear, month, day)) return false;
        if (genderSection < 0 || genderSection > 9999) return false;
        if (citizenship !== '0' && citizenship !== '1') return false;
        if (!this.isValidChecksum(id)) return false;

        return true;
    }

    isValidDate(year, month, day) {
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
    }

    isValidChecksum(id) {
        let sum = 0;
        let shouldDouble = false;
        for (let i = 12; i >= 0; i--) {
            let digit = parseInt(id.charAt(i), 10);
            if (shouldDouble) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
            shouldDouble = !shouldDouble;
        }
        return sum % 10 === 0;
    }
}