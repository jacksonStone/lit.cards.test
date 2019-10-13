//For conversion of our happy-path.test.js into valid JS
#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>

#define STRING const char*
typedef struct {
    STRING find;
    STRING replace;
    int findLength;
    int replaceLength;
} macro;

//Increment MACRO_COUNT and add a new macro if you want to do more!
// 12 microseconds per macro per 1000 chars
#define MACRO_COUNT 4
static macro macros[MACRO_COUNT] = {
    {"AP.", "await page."},
    {"APC(", "await wclick(page, "},
    {"wait_for_save", "(await waitForChangesToSave(page))"},
    {"server_data", "(await getUserServerData(page))"}
};

static int strlen(STRING str) {
    int count = 0;
    char * strw = (char*) str;
    while(*str) {
        str++;
        count++;
    }
    return count;
}

static void recordMacroLengths() {
    for(int i = 0; i < MACRO_COUNT; i++) {
        macro * m = &macros[i];
        m->findLength = strlen(m->find);
        m->replaceLength = strlen(m->replace);
    }
}

static char* getFileContents(STRING fileName){
    FILE *f = fopen(fileName, "r");
    //Gets the size of the file
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    fseek(f, 0, SEEK_SET);

    //Allots length + 1 for \0 room
    char * fileContent = (char*) malloc(fsize + 1);
    fread(fileContent, 1, fsize, f);
    fclose(f);
    fileContent[fsize] = 0;
    return fileContent;
}

static double getCurrentMicroseconds() {
        //For timing purposes
        struct timeval  tv;
        gettimeofday(&tv, NULL);
        double time_in_micro = (tv.tv_sec) * 1000000 + (tv.tv_usec);
        return time_in_micro;
}

static void writeFileContents(STRING outputPath, char * contents) {
    FILE * target = fopen("./build/happy-path.test.js", "w+" );
    fputs(contents, target);
    fclose(target);
}

int main() {
    double startTime = getCurrentMicroseconds();

    recordMacroLengths();
    char* contents = getFileContents("./happy-path.test.js");
    //Plenty of padding
    int startingLength = strlen(contents);
    int remainingContentLen = startingLength;
    char newContents[startingLength*2];
    int contentMarker = 0;
    int onFirstChar = 1;
    while(*contents) {
        int matched = 0;
        if(*contents == '\n') {
            onFirstChar = 1;
            newContents[contentMarker] = *contents;
            contentMarker++;
            contents++;
            remainingContentLen--;
            continue;
        }
        if(*contents == ' ' || *contents == '\t') {
            newContents[contentMarker] = *contents;
            contentMarker++;
            contents++;
            remainingContentLen--;
            continue;
        }
        if(onFirstChar && *contents == '/' && (*(contents+1) == '/' || *(contents+1) == '*')) {
            while(*contents != '\n' && *contents) {
               contents++;
               remainingContentLen--;
            }
            continue;
        }
        for(int i = 0; i < MACRO_COUNT; i++) {
            macro m = macros[i];

            int macroLength = m.findLength;
            if (remainingContentLen < macroLength) {
                //Not enough space
                continue;
            }

            //See if matches current macro
            for (int j = 0; j < macroLength; j++) {
                if (m.find[j] == contents[j]) {
                    if(j == macroLength - 1) {
                        matched = 1;
                    }
                } else {
                    break;
                }
            }

            //Replace macro with text
            if (matched) {
               int replaceLength = m.replaceLength;
               for(int j = 0; j < replaceLength; j++) {
                   newContents[contentMarker + j] = m.replace[j];
               }
               contentMarker += replaceLength;
               contents += macroLength;
               remainingContentLen -= macroLength;
               onFirstChar = 0;
               break;
            }

        }
        if (!matched) {
                onFirstChar = 0;
                newContents[contentMarker] = *contents;
                contentMarker++;
                contents++;
                remainingContentLen--;
        }
    }

    newContents[contentMarker] = 0;

    writeFileContents("./build/happy-path.test.js", newContents);
    double finishedTime = getCurrentMicroseconds();

    printf("Microseconds: %5.0f\n", (finishedTime - startTime));

    printf("%d\n", startingLength);


    return 0;
}

