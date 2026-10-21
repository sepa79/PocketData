package io.pockethive.pocketdata;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RecordFormatTest {
    private final RecordFormat formats = new RecordFormat();
    private DatasetDefinition definition() {
        return new DatasetDefinition("lab", "cards", "", List.of(new RecordField("accountNumber", "string", true), new RecordField("count", "integer", true)), List.of("ready"));
    }
    @Test void preservesUnusedFieldsAndLeadingZeroes() {
        Map<String, Object> record = formats.convert(definition(), Map.of("accountNumber", "000123", "count", "2", "extraField", "untouched"));
        assertEquals("000123", record.get("accountNumber")); assertEquals(2L, record.get("count")); assertEquals("untouched", record.get("extraField"));
    }
    @Test void rejectsMissingRequiredField() { assertThrows(ApiFailure.class, () -> formats.convert(definition(), Map.of("count", "2"))); }
    @Test void rejectsInvalidInteger() { assertThrows(ApiFailure.class, () -> formats.convert(definition(), Map.of("accountNumber", "1", "count", "two"))); }
    @Test void rejectsDuplicateField() { assertThrows(ApiFailure.class, () -> formats.validate(new DatasetDefinition("lab", "cards", "", List.of(new RecordField("account", "string", true), new RecordField("account", "string", true)), List.of("ready")))); }
    @Test void rejectsInvalidListNamespace() { assertThrows(ApiFailure.class, () -> formats.validate(new DatasetDefinition("lab", "cards", "", definition().fields(), List.of("meta:format")))); }
}
