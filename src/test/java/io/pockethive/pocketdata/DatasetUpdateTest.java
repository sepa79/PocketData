package io.pockethive.pocketdata;

import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DatasetUpdateTest {
    private final RecordFormat formats = new RecordFormat();
    private final RecordField account = new RecordField("accountNumber", "string", true);
    private final DatasetDefinition original = new DatasetDefinition("lab", "cards", "Initial", List.of(account), List.of("ready"));

    @Test void permitsDescriptionAndAdditiveListsAndOptionalFields() {
        var expanded = new DatasetDefinition("lab", "cards", "Changed", List.of(account, new RecordField("customer", "string", false)), List.of("ready", "returned"));
        assertDoesNotThrow(() -> formats.validateUpdate(original, expanded));
        assertEquals("0001", formats.convert(expanded, java.util.Map.of("accountNumber", "0001")).get("accountNumber"));
    }
    @Test void rejectsChangedNamespaces() {
        assertEquals(400, assertThrows(ApiFailure.class, () -> formats.validateUpdate(original,
            new DatasetDefinition("other", "cards", "", original.fields(), original.lists()))).status());
        assertEquals(400, assertThrows(ApiFailure.class, () -> formats.validateUpdate(original,
            new DatasetDefinition("lab", "other", "", original.fields(), original.lists()))).status());
    }
    @Test void rejectsRemovedOrRenamedLists() {
        assertThrows(ApiFailure.class, () -> formats.validateUpdate(original,
            new DatasetDefinition("lab", "cards", "", original.fields(), List.of("returned"))));
    }
    @Test void rejectsChangedFieldTypesAndRequiredFlags() {
        for (RecordField replacement : List.of(new RecordField("accountNumber", "integer", true), new RecordField("accountNumber", "string", false), new RecordField("renamed", "string", true))) {
            assertThrows(ApiFailure.class, () -> formats.validateUpdate(original,
                new DatasetDefinition("lab", "cards", "", List.of(replacement), original.lists())));
        }
    }
    @Test void rejectsNewRequiredColumnsAndDuplicateFields() {
        for (RecordField addition : List.of(new RecordField("customer", "string", true), account)) {
            assertThrows(ApiFailure.class, () -> formats.validateUpdate(original,
                new DatasetDefinition("lab", "cards", "", List.of(account, addition), original.lists())));
        }
    }
    @Test void requiresBothOpeningSnapshotAndCandidate() {
        assertThrows(ApiFailure.class, () -> formats.validateUpdate(null, original));
        assertThrows(ApiFailure.class, () -> formats.validateUpdate(original, null));
    }
}
