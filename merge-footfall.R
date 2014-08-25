# This is now redundant.

library(dplyr)
library(RCurl)
library(rjson)

CORPUS_DOWNLOAD_URL <- "https://raw.githubusercontent.com/theodi/orpi-corpus/master/data/corpus.csv"
FOOTFALL_DOWNLOAD_URL <- "https://raw.githubusercontent.com/theodi/orpi-analysis/master/passenger-data/footfall-stations.csv"

corpus <- read.csv(text = getURL(CORPUS_DOWNLOAD_URL))
footfall.stations <-  read.csv(text = getURL(FOOTFALL_DOWNLOAD_URL))

names(footfall.stations) <- c('X3ALPHA', 'station', 'total-footfall')

corpus_test <- left_join(corpus, footfall.stations, by = 'X3ALPHA')

#-------------------
# Diagnostics

# Expect only 3
table(nchar(corpus$X3ALPHA))
table(nchar(footfall.stations$X3ALPHA))

# Expect 1
length(unique(corpus$X3ALPHA)) / nrow(corpus)
length(unique(footfall.stations$X3ALPHA)) / nrow(footfall.stations)

# Expect 50-80% true
table(is.na(corpus_test$station))
#FALSE  TRUE 
#2526   514

