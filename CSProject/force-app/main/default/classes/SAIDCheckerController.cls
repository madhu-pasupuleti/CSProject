public without sharing class SAIDCheckerController {
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> fetchIdInfo(String idNumber) {
        if (!isValidSAID(idNumber)) {
            throw new AuraHandledException('Invalid SA ID Number');
        }

        Date dob;
        String gender;
        Boolean isCitizen;

        try {
            dob = parseDOB(idNumber);
            gender = getGender(idNumber);
            isCitizen = getCitizenship(idNumber);
        } catch (Exception e) {
            throw new AuraHandledException('Failed to parse SA ID details.');
        }

        // Fetch holidays first to determine if it's a successful search
        List<Map<String, String>> holidays = fetchPublicHolidays(dob.year());
        if (holidays.isEmpty()) {
            throw new AuraHandledException('No holidays returned; not counted as a successful search.');
        }

        // Query all records with the same SA_ID__c
        List<SA_ID_Info_Tracker__c> existingRecords = [
            SELECT Id, Search_Count__c, Date_of_Birth__c, Gender__c, Is_Citizen__c
            FROM SA_ID_Info_Tracker__c
            WHERE SA_ID__c = :idNumber
        ];

        System.debug('existingRecord'+existingRecords);

        SA_ID_Info_Tracker__c record;
        if (existingRecords.size() > 1) {
            // You have duplicates in your org; fail gracefully
            throw new AuraHandledException('Multiple records found with the same SA ID. Please contact admin.');
        } else if (existingRecords.isEmpty()) {
            // Insert new record
            record = new SA_ID_Info_Tracker__c(
                SA_ID__c = idNumber,
                Date_of_Birth__c = dob,
                Gender__c = gender,
                Is_Citizen__c = isCitizen,
                Search_Count__c = 1
            );
            try {
                insert record;
            } catch (Exception e) {
                throw new AuraHandledException('Error inserting SA ID record: ' + e.getMessage());
            }
        } else {
            // Update existing record
            record = existingRecords[0];
            record.Search_Count__c++;
            record.Date_of_Birth__c = dob;
            record.Gender__c = gender;
            record.Is_Citizen__c = isCitizen;

            try {
                update record;
            } catch (Exception e) {
                throw new AuraHandledException('Error updating SA ID record: ' + e.getMessage());
            }
        }

        return new Map<String, Object>{
            'dob' => String.valueOf(dob),
            'gender' => gender,
            'citizen' => isCitizen ? 'Yes' : 'No',
            'holidays' => holidays
        };
    }

    private static Date parseDOB(String id) {
        Integer year = Integer.valueOf(id.substring(0, 2));
        Integer month = Integer.valueOf(id.substring(2, 4));
        Integer day = Integer.valueOf(id.substring(4, 6));
        year += (year >= 0 && year <= 24) ? 2000 : 1900;
        return Date.newInstance(year, month, day);
    }

    private static String getGender(String id) {
        Integer genderVal = Integer.valueOf(id.substring(6, 10));
        return genderVal < 5000 ? 'Female' : 'Male';
    }

    private static Boolean getCitizenship(String id) {
        return id.substring(10, 11) == '0';
    }

    private static Boolean isValidSAID(String id) {
        if (String.isBlank(id) || id.length() != 13 || !Pattern.matches('\\d{13}', id)) {
            return false;
        }
        // Optionally add checksum validation here for better validation
        return true;
    }

    private static List<Map<String, String>> fetchPublicHolidays(Integer year) {
        Http http = new Http();
        HttpRequest req = new HttpRequest();
        req.setEndpoint('https://calendarific.com/api/v2/holidays?api_key=24c5e86734eb44dc4a962826324a5546e74dc42f&country=ZA&year=' + year);
        req.setMethod('GET');

        HttpResponse res = http.send(req);
        if (res.getStatusCode() != 200) return new List<Map<String, String>>();

        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        List<Object> holidays = (List<Object>) ((Map<String, Object>)body.get('response')).get('holidays');

        List<Map<String, String>> output = new List<Map<String, String>>();
        for (Object obj : holidays) {
            Map<String, Object> h = (Map<String, Object>) obj;
            output.add(new Map<String, String>{
                'name' => (String) h.get('name'),
                'date' => (String)((Map<String, Object>)h.get('date')).get('iso')
            });
        }
        return output;
    }
}